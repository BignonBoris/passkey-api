import Order from "../models/order.model";

export type SearchDriverSnapshot = {
  id: string;
  name: string;
  phone: string;
};

type SearchAttemptSnapshot = {
  searchStartedAt: string;
  endedAt?: string;
  result: "PENDING" | "ACCEPTED" | "NO_DRIVER_FOUND" | "CANCELLED";
  nearbyDriversCount: number;
  notifiedDrivers: SearchDriverSnapshot[];
  declinedDrivers: Array<SearchDriverSnapshot & { decisionAt: string }>;
  missedDrivers: SearchDriverSnapshot[];
  acceptedDriver?: SearchDriverSnapshot | null;
};

export type OrderSearchStatsPayload = {
  failedSearchCount: number;
  attempts: SearchAttemptSnapshot[];
};

function normalizeDriverSnapshot(input: Partial<SearchDriverSnapshot>): SearchDriverSnapshot | null {
  const id = String(input.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(input.name || "Livreur").trim() || "Livreur",
    phone: String(input.phone || "").trim(),
  };
}

function resolveAttemptDriverBaseSnapshot(
  attempt: SearchAttemptSnapshot,
  driverId: string,
): SearchDriverSnapshot | null {
  const fromNotified = attempt.notifiedDrivers.find((driver) => driver.id === driverId);
  if (fromNotified) return fromNotified;

  const fromDeclined = attempt.declinedDrivers.find((driver) => driver.id === driverId);
  if (fromDeclined) {
    return {
      id: fromDeclined.id,
      name: fromDeclined.name,
      phone: fromDeclined.phone,
    };
  }

  const fromAccepted = attempt.acceptedDriver;
  if (fromAccepted?.id === driverId) {
    return fromAccepted;
  }

  return null;
}

function resolveAttemptDriverSnapshot(
  attempt: SearchAttemptSnapshot,
  input: Partial<SearchDriverSnapshot>,
): SearchDriverSnapshot | null {
  const driverId = String(input.id || "").trim();
  if (!driverId) return null;

  const normalized = normalizeDriverSnapshot(input) ?? {
    id: driverId,
    name: "",
    phone: "",
  };

  const fromAttempt = resolveAttemptDriverBaseSnapshot(attempt, normalized.id);
  if (!fromAttempt) {
    return {
      id: normalized.id,
      name: normalized.name.trim() || "Livreur",
      phone: normalized.phone.trim(),
    };
  }

  return {
    id: normalized.id,
    name: normalized.name.trim() || fromAttempt.name,
    phone: normalized.phone.trim() || fromAttempt.phone,
  };
}

function parseStats(raw: unknown): OrderSearchStatsPayload {
  if (typeof raw !== "string" || !raw.trim()) {
    return { failedSearchCount: 0, attempts: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OrderSearchStatsPayload>;
    return {
      failedSearchCount: Number(parsed.failedSearchCount ?? 0) || 0,
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
    };
  } catch {
    return { failedSearchCount: 0, attempts: [] };
  }
}

function getOpenAttempt(stats: OrderSearchStatsPayload): SearchAttemptSnapshot | null {
  for (let index = stats.attempts.length - 1; index >= 0; index -= 1) {
    const attempt = stats.attempts[index];
    if (!attempt.endedAt || attempt.result === "PENDING") {
      return attempt;
    }
  }
  return null;
}

async function saveStats(orderId: string, stats: OrderSearchStatsPayload) {
  await Order.update(
    {
      searchFailureCount: stats.failedSearchCount,
      driverSearchStatsJson: JSON.stringify(stats),
    },
    { where: { id: orderId } },
  );
}

export async function beginOrderSearchAttempt(
  orderId: string,
  drivers: SearchDriverSnapshot[],
) {
  const order = await Order.findByPk(orderId);
  if (!order) return;

  const stats = parseStats(order.get("driverSearchStatsJson"));
  const snapshots = drivers
    .map((driver) => normalizeDriverSnapshot(driver))
    .filter((driver): driver is SearchDriverSnapshot => driver !== null);

  stats.attempts.push({
    searchStartedAt: new Date().toISOString(),
    result: "PENDING",
    nearbyDriversCount: snapshots.length,
    notifiedDrivers: snapshots,
    declinedDrivers: [],
    missedDrivers: [],
    acceptedDriver: null,
  });

  await saveStats(String(order.get("id")), stats);
}

export async function markOrderSearchDriverDeclined(
  orderId: string,
  driver: Partial<SearchDriverSnapshot>,
) {
  const order = await Order.findByPk(orderId);
  if (!order) return;

  const stats = parseStats(order.get("driverSearchStatsJson"));
  const openAttempt = getOpenAttempt(stats);
  const snapshot = openAttempt
    ? resolveAttemptDriverSnapshot(openAttempt, driver)
    : null;
  if (!openAttempt || !snapshot) return;

  const alreadyDeclined = openAttempt.declinedDrivers.some(
    (item) => item.id === snapshot.id,
  );
  if (alreadyDeclined) return;

  openAttempt.declinedDrivers.push({
    ...snapshot,
    decisionAt: new Date().toISOString(),
  });

  await saveStats(String(order.get("id")), stats);
}

export async function markOrderSearchAccepted(
  orderId: string,
  driver: Partial<SearchDriverSnapshot>,
) {
  const order = await Order.findByPk(orderId);
  if (!order) return;

  const stats = parseStats(order.get("driverSearchStatsJson"));
  const openAttempt = getOpenAttempt(stats);
  const snapshot = openAttempt
    ? resolveAttemptDriverSnapshot(openAttempt, driver)
    : null;
  if (!openAttempt || !snapshot) return;

  openAttempt.acceptedDriver = snapshot;
  openAttempt.result = "ACCEPTED";
  openAttempt.endedAt = new Date().toISOString();
  openAttempt.missedDrivers = [];

  await saveStats(String(order.get("id")), stats);
}

export async function markOrderSearchFailed(orderId: string) {
  const order = await Order.findByPk(orderId);
  if (!order) return;

  const stats = parseStats(order.get("driverSearchStatsJson"));
  const openAttempt = getOpenAttempt(stats);
  if (!openAttempt) return;

  const declinedIds = new Set(openAttempt.declinedDrivers.map((item) => item.id));
  const acceptedId = openAttempt.acceptedDriver?.id?.trim() ?? "";

  openAttempt.missedDrivers = openAttempt.notifiedDrivers.filter(
    (driver) => !declinedIds.has(driver.id) && driver.id !== acceptedId,
  );
  openAttempt.result = "NO_DRIVER_FOUND";
  openAttempt.endedAt = new Date().toISOString();
  stats.failedSearchCount += 1;

  await saveStats(String(order.get("id")), stats);
}

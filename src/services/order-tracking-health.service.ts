import OrderTrackingHealth from "../models/order-tracking-health.model";

const SIGNAL_LOST_THRESHOLD_SECONDS = 45;
const STATIONARY_THRESHOLD_SECONDS = 120;
const MOVEMENT_DISTANCE_THRESHOLD_METERS = 25;

type TrackingHealthStatusCode =
  | "UNKNOWN"
  | "MOVING"
  | "STATIONARY"
  | "IMMOBILE"
  | "SIGNAL_LOST"
  | "GPS_OFF"
  | "LOCATION_PERMISSION_DENIED";

type TrackingHealthSignalStatus =
  | "UNKNOWN"
  | "LIVE"
  | "STALE"
  | "LOST"
  | "BLOCKED";

export type OrderTrackingHealthSnapshot = {
  orderId: string;
  driverId: string;
  status: TrackingHealthStatusCode;
  rawStatus: string;
  signalStatus: TrackingHealthSignalStatus;
  movementStatus: "UNKNOWN" | "MOVING" | "STATIONARY";
  reasonCode: string | null;
  reasonLabel: string | null;
  lastSignalAt: string | null;
  lastLocationAt: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  gpsEnabled: boolean | null;
  locationPermission: boolean | null;
  socketConnected: boolean | null;
  appState: string | null;
  stationarySince: string | null;
  stationaryDurationSeconds: number | null;
  signalAgeSeconds: number | null;
  updatedAt: string | null;
};

type TrackingHealthInput = {
  orderId: string;
  driverId?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  gpsEnabled?: unknown;
  locationPermission?: unknown;
  socketConnected?: unknown;
  appState?: unknown;
  heartbeatAt?: Date | string | null;
  reasonCode?: unknown;
  reasonLabel?: unknown;
  metadata?: Record<string, unknown> | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIsoString(value: unknown): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
) {
  const earthRadiusMeters = 6371000;
  const dLat = degToRad(latB - latA);
  const dLng = degToRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(latA)) *
      Math.cos(degToRad(latB)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveTrackingHealthStatus(params: {
  gpsEnabled: boolean | null;
  locationPermission: boolean | null;
  socketConnected: boolean | null;
  movementStatus: "UNKNOWN" | "MOVING" | "STATIONARY";
  signalAgeSeconds: number | null;
  stationaryDurationSeconds: number | null;
}): {
  status: TrackingHealthStatusCode;
  rawStatus: string;
  signalStatus: TrackingHealthSignalStatus;
  reasonCode: string | null;
  reasonLabel: string | null;
} {
  if (params.locationPermission === false) {
    return {
      status: "LOCATION_PERMISSION_DENIED",
      rawStatus: "Permission GPS refusée",
      signalStatus: "BLOCKED",
      reasonCode: "LOCATION_PERMISSION_DENIED",
      reasonLabel: "Permission GPS refusée",
    };
  }

  if (params.gpsEnabled === false) {
    return {
      status: "GPS_OFF",
      rawStatus: "GPS coupé",
      signalStatus: "BLOCKED",
      reasonCode: "GPS_OFF",
      reasonLabel: "GPS coupé",
    };
  }

  if (params.socketConnected === false) {
    return {
      status: "SIGNAL_LOST",
      rawStatus: "Signal perdu",
      signalStatus: "LOST",
      reasonCode: "SIGNAL_LOST",
      reasonLabel: "Connexion perdue",
    };
  }

  if (params.signalAgeSeconds !== null && params.signalAgeSeconds > SIGNAL_LOST_THRESHOLD_SECONDS) {
    return {
      status: "SIGNAL_LOST",
      rawStatus: "Signal perdu",
      signalStatus: "LOST",
      reasonCode: "SIGNAL_LOST",
      reasonLabel: "Dernier signal trop ancien",
    };
  }

  if (
    params.movementStatus === "STATIONARY" &&
    params.stationaryDurationSeconds !== null &&
    params.stationaryDurationSeconds >= STATIONARY_THRESHOLD_SECONDS
  ) {
    return {
      status: "IMMOBILE",
      rawStatus: "Livreur immobile",
      signalStatus: "LIVE",
      reasonCode: "IMMOBILE",
      reasonLabel: "La position n'a pas bougé récemment",
    };
  }

  if (params.movementStatus === "STATIONARY") {
    return {
      status: "STATIONARY",
      rawStatus: "Position stable",
      signalStatus: "LIVE",
      reasonCode: "STATIONARY",
      reasonLabel: "La position semble stable",
    };
  }

  if (params.movementStatus === "MOVING") {
    return {
      status: "MOVING",
      rawStatus: "En mouvement",
      signalStatus: "LIVE",
      reasonCode: "MOVING",
      reasonLabel: "Le livreur transmet des positions actives",
    };
  }

  if (params.signalAgeSeconds !== null) {
    if (params.signalAgeSeconds <= 15) {
      return {
        status: "UNKNOWN",
        rawStatus: "Signal actif",
        signalStatus: "LIVE",
        reasonCode: "LIVE",
        reasonLabel: "Dernier signal récent",
      };
    }

    return {
      status: "UNKNOWN",
      rawStatus: "Signal faible",
      signalStatus: "STALE",
      reasonCode: "STALE_SIGNAL",
      reasonLabel: "Dernier signal ancien",
    };
  }

  return {
    status: "UNKNOWN",
    rawStatus: "État inconnu",
    signalStatus: "UNKNOWN",
    reasonCode: null,
    reasonLabel: "Aucune information exploitable",
  };
}

function formatTrackingHealthSnapshot(
  record: OrderTrackingHealth,
  referenceTime = new Date(),
): OrderTrackingHealthSnapshot {
  const lastSignalAt = toDate(record.get("lastHeartbeatAt") || record.get("lastLocationAt") || record.get("updatedAt"));
  const stationarySince = toDate(record.get("stationarySince"));
  const signalAgeSeconds = lastSignalAt
    ? Math.max(0, Math.floor((referenceTime.getTime() - lastSignalAt.getTime()) / 1000))
    : null;
  const stationaryDurationSeconds = stationarySince
    ? Math.max(0, Math.floor((referenceTime.getTime() - stationarySince.getTime()) / 1000))
    : null;
  const gpsEnabled = parseOptionalBoolean(record.get("gpsEnabled"));
  const locationPermission = parseOptionalBoolean(record.get("locationPermission"));
  const socketConnected = parseOptionalBoolean(record.get("socketConnected"));
  const movementStatus = normalizeText(record.get("movementStatus")).toUpperCase() as
    | "UNKNOWN"
    | "MOVING"
    | "STATIONARY";
  const derived = resolveTrackingHealthStatus({
    gpsEnabled,
    locationPermission,
    socketConnected,
    movementStatus,
    signalAgeSeconds,
    stationaryDurationSeconds,
  });

  return {
    orderId: normalizeText(record.get("orderId")),
    driverId: normalizeText(record.get("driverId")),
    status: derived.status,
    rawStatus: derived.rawStatus,
    signalStatus: derived.signalStatus,
    movementStatus,
    reasonCode: normalizeText(record.get("reasonCode")) || derived.reasonCode,
    reasonLabel: normalizeText(record.get("reasonLabel")) || derived.reasonLabel,
    lastSignalAt: toIsoString(lastSignalAt),
    lastLocationAt: toIsoString(record.get("lastLocationAt")),
    lastLatitude: toFiniteNumber(record.get("lastLatitude")),
    lastLongitude: toFiniteNumber(record.get("lastLongitude")),
    gpsEnabled,
    locationPermission,
    socketConnected,
    appState: normalizeText(record.get("appState")) || null,
    stationarySince: toIsoString(stationarySince),
    stationaryDurationSeconds,
    signalAgeSeconds,
    updatedAt: toIsoString(record.get("updatedAt")),
  };
}

async function loadTrackingHealth(orderId: string) {
  const normalizedOrderId = normalizeText(orderId);
  if (!normalizedOrderId) return null;
  return OrderTrackingHealth.findOne({ where: { orderId: normalizedOrderId } });
}

export async function getOrderTrackingHealthSnapshot(orderId: string) {
  const record = await loadTrackingHealth(orderId);
  if (!record) return null;
  return formatTrackingHealthSnapshot(record);
}

export async function recordOrderTrackingHealthSnapshot(params: TrackingHealthInput) {
  const orderId = normalizeText(params.orderId);
  if (!orderId) {
    throw new Error("orderId is required.");
  }

  const now = params.heartbeatAt ? new Date(params.heartbeatAt) : new Date();
  const nextLatitude = toFiniteNumber(params.latitude);
  const nextLongitude = toFiniteNumber(params.longitude);
  const hasLocationUpdate = nextLatitude !== null && nextLongitude !== null;
  const nextGpsEnabled = parseOptionalBoolean(params.gpsEnabled);
  const nextLocationPermission = parseOptionalBoolean(params.locationPermission);
  const nextSocketConnected = parseOptionalBoolean(params.socketConnected);
  const nextAppState = normalizeText(params.appState) || null;
  const nextReasonCode = normalizeText(params.reasonCode) || null;
  const nextReasonLabel = normalizeText(params.reasonLabel) || null;

  let record = await loadTrackingHealth(orderId);
  if (!record) {
    record = OrderTrackingHealth.build({
      orderId,
      driverId: normalizeText(params.driverId),
      movementStatus: "UNKNOWN",
    });
  }

  const previousLatitude = toFiniteNumber(record.get("lastLatitude"));
  const previousLongitude = toFiniteNumber(record.get("lastLongitude"));
  const previousMovementStatus = normalizeText(record.get("movementStatus")).toUpperCase() as
    | "UNKNOWN"
    | "MOVING"
    | "STATIONARY";
  const previousStationarySince = toDate(record.get("stationarySince"));
  let nextMovementStatus: "UNKNOWN" | "MOVING" | "STATIONARY" = previousMovementStatus;
  let nextStationarySince = previousStationarySince;

  if (hasLocationUpdate) {
    if (previousLatitude !== null && previousLongitude !== null) {
      const movedMeters = distanceMeters(previousLatitude, previousLongitude, nextLatitude, nextLongitude);
      if (movedMeters > MOVEMENT_DISTANCE_THRESHOLD_METERS) {
        nextMovementStatus = "MOVING";
        nextStationarySince = null;
      } else {
        nextMovementStatus = "STATIONARY";
        if (!nextStationarySince) {
          nextStationarySince = now;
        }
      }
    } else {
      nextMovementStatus = "UNKNOWN";
      nextStationarySince = null;
    }
  }

  const nextDriverId = normalizeText(params.driverId) || normalizeText(record.get("driverId"));
  if (nextDriverId) {
    record.set("driverId", nextDriverId);
  }

  if (hasLocationUpdate) {
    record.set("lastLocationAt", now);
    record.set("lastLatitude", nextLatitude);
    record.set("lastLongitude", nextLongitude);
  }

  record.set("lastHeartbeatAt", now);
  record.set("movementStatus", nextMovementStatus);
  record.set("stationarySince", nextStationarySince);

  if (nextGpsEnabled !== null) {
    record.set("gpsEnabled", nextGpsEnabled);
  }
  if (nextLocationPermission !== null) {
    record.set("locationPermission", nextLocationPermission);
  }
  if (nextSocketConnected !== null) {
    record.set("socketConnected", nextSocketConnected);
  } else if (hasLocationUpdate) {
    record.set("socketConnected", true);
  }
  if (nextAppState) {
    record.set("appState", nextAppState);
  }
  if (nextReasonCode) {
    record.set("reasonCode", nextReasonCode);
  }
  if (nextReasonLabel) {
    record.set("reasonLabel", nextReasonLabel);
  }
  if (params.metadata) {
    record.set("metadataJson", JSON.stringify(params.metadata));
  }

  await record.save();
  return formatTrackingHealthSnapshot(record);
}

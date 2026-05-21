export type OrderPaymentFlowMode =
  | "SEARCH_BEFORE_PAYMENT"
  | "PAYMENT_BEFORE_SEARCH";

const rawMode = String(
  process.env.ORDER_PAYMENT_FLOW_MODE || "SEARCH_BEFORE_PAYMENT",
)
  .trim()
  .toUpperCase();

export const activeOrderPaymentFlowMode: OrderPaymentFlowMode =
  rawMode === "PAYMENT_BEFORE_SEARCH"
    ? "PAYMENT_BEFORE_SEARCH"
    : "SEARCH_BEFORE_PAYMENT";

const rawPromptWindowMs = Number(
  process.env.ORDER_PAYMENT_PROMPT_WINDOW_MS || 0,
);

export const paymentPromptWindowMs =
  rawPromptWindowMs > 0
    ? rawPromptWindowMs
    : activeOrderPaymentFlowMode === "SEARCH_BEFORE_PAYMENT"
      ? 8 * 60 * 1000
      : 3 * 60 * 1000;

const rawReminderLeadMs = Number(
  process.env.ORDER_PAYMENT_PROMPT_REMINDER_LEAD_MS || 0,
);

export const paymentPromptReminderLeadMs =
  rawReminderLeadMs > 0
    ? rawReminderLeadMs
    : activeOrderPaymentFlowMode === "SEARCH_BEFORE_PAYMENT"
      ? 3 * 60 * 1000
      : 0;

function normalizePaymentMethod(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function isRemoteOrderPaymentMethod(value: unknown) {
  const normalized = normalizePaymentMethod(value);
  return normalized === "MOBILE_MONEY" || normalized === "CARD";
}

export function shouldStartDriverSearchImmediatelyForPaymentMethod(
  paymentMethod: unknown,
) {
  const normalized = normalizePaymentMethod(paymentMethod);
  if (normalized === "CASH" || normalized === "ESPECE") return true;
  if (!isRemoteOrderPaymentMethod(normalized)) return true;
  return activeOrderPaymentFlowMode === "SEARCH_BEFORE_PAYMENT";
}

export function shouldPromptPaymentAfterDriverAccept(params: {
  paymentMethod: unknown;
  paymentStatus: unknown;
}) {
  if (activeOrderPaymentFlowMode !== "SEARCH_BEFORE_PAYMENT") return false;
  if (!isRemoteOrderPaymentMethod(params.paymentMethod)) return false;
  const paymentStatus = String(params.paymentStatus || "")
    .trim()
    .toUpperCase();
  return paymentStatus !== "PAID";
}

export function shouldStartDeferredSearchAfterPayment(params: {
  paymentMethod: unknown;
  orderStatus: unknown;
  driverId: unknown;
  previousCheckoutStatus: unknown;
}) {
  if (activeOrderPaymentFlowMode !== "PAYMENT_BEFORE_SEARCH") return false;
  if (!isRemoteOrderPaymentMethod(params.paymentMethod)) return false;
  const orderStatus = String(params.orderStatus || "").trim().toUpperCase();
  const driverId = String(params.driverId || "").trim();
  const previousCheckoutStatus = String(params.previousCheckoutStatus || "")
    .trim()
    .toUpperCase();
  return (
    orderStatus === "PENDING" &&
    !driverId &&
    previousCheckoutStatus !== "PAID"
  );
}

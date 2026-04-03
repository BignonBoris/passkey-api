import axios from "axios";
import Payment from "@/models/payment.model";
import User from "@/models/user.model";

type FedaPayTransaction = {
  id: number | string;
  reference?: string;
  amount?: number;
  description?: string;
  callback_url?: string;
  status?: string;
  approved_at?: string | null;
  canceled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function extractTransactionPayload(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  const nestedData = asRecord(root.data);
  const nestedTransaction = asRecord(root.transaction);
  const nestedEntity = asRecord(root.entity);
  const versionedTransaction = asRecord(root["v1/transaction"]);

  if (firstNonEmptyString(root.id)) return root;
  if (firstNonEmptyString(versionedTransaction.id)) return versionedTransaction;
  if (firstNonEmptyString(nestedData.id)) return nestedData;
  if (firstNonEmptyString(nestedTransaction.id)) return nestedTransaction;
  if (firstNonEmptyString(nestedEntity.id)) return nestedEntity;

  const nestedTransactionInData = asRecord(nestedData.transaction);
  if (firstNonEmptyString(nestedTransactionInData.id)) return nestedTransactionInData;

  return root;
}

function findFirstObjectWithId(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstObjectWithId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  if (firstNonEmptyString(record.id, record.transaction_id, record.reference)) {
    return record;
  }

  for (const nestedValue of Object.values(record)) {
    const found = findFirstObjectWithId(nestedValue, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractTokenPayload(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  const nestedData = asRecord(root.data);
  const nestedToken = asRecord(root.token);
  const versionedTransaction = asRecord(root["v1/transaction"]);

  if (firstNonEmptyString(root.url, root.token, root.payment_url, root.checkout_url)) return root;
  if (
    firstNonEmptyString(
      versionedTransaction.url,
      versionedTransaction.token,
      versionedTransaction.payment_url,
      versionedTransaction.checkout_url,
      versionedTransaction.payment_token,
    )
  ) {
    return versionedTransaction;
  }
  if (firstNonEmptyString(nestedData.url, nestedData.token, nestedData.payment_url, nestedData.checkout_url)) {
    return nestedData;
  }
  if (firstNonEmptyString(nestedToken.url, nestedToken.token, nestedToken.payment_url, nestedToken.checkout_url)) {
    return nestedToken;
  }
  return root;
}

function getFedaPayEnvironment() {
  return (process.env.FEDAPAY_ENV || "sandbox").trim().toLowerCase() === "live"
    ? "live"
    : "sandbox";
}

function getFedaPayApiBaseUrl() {
  return getFedaPayEnvironment() === "live"
    ? "https://api.fedapay.com/v1"
    : "https://sandbox-api.fedapay.com/v1";
}

function getAppBaseUrl() {
  return (
    process.env.FEDAPAY_CALLBACK_BASE_URL ||
    process.env.APP_BASE_URL ||
    `http://localhost:${process.env.PORT || 3000}`
  ).replace(/\/+$/, "");
}

function getFedaPaySecretKey() {
  return String(process.env.FEDAPAY_SECRET_KEY || "").trim();
}

export function isFedaPayConfigured() {
  return getFedaPaySecretKey().length > 0;
}

function getCountryCode() {
  return String(process.env.FEDAPAY_PHONE_COUNTRY || "BJ").trim().toUpperCase();
}

function sanitizePhoneNumber(phone?: string | null) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("229")) return `+${digits}`;
  return `+229${digits}`;
}

function buildFedaPayLocalPhoneNumber(phone?: string | null) {
  const sanitized = sanitizePhoneNumber(phone);
  const digits = sanitized.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("229") && digits.length > 3) {
    return digits.slice(3);
  }
  return digits;
}

function buildFallbackEmail(user: User) {
  const existing = String(user.get("email") || "").trim();
  if (existing) return existing;
  const phoneDigits = String(user.get("phone") || "").replace(/[^\d]/g, "").trim();
  const suffix =
    phoneDigits || String(user.get("id") || "client").replace(/[^a-zA-Z0-9]/g, "");
  return `client-${suffix}@passkey.example.com`;
}

function splitCustomerName(name?: string | null) {
  const normalized = String(name || "").trim();
  if (!normalized) {
    return { firstname: "Client", lastname: "PassKey" };
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstname: parts[0], lastname: "PassKey" };
  }
  return {
    firstname: parts[0],
    lastname: parts.slice(1).join(" "),
  };
}

function buildCallbackUrl(paymentId: string) {
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/api/payments/fedapay/callback?paymentId=${encodeURIComponent(paymentId)}`;
}

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${getFedaPaySecretKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function mapProviderStatusToLocalStatus(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["approved", "accepted", "successful", "paid"].includes(normalized)) {
    return "PAID";
  }
  if (["canceled", "cancelled", "declined", "failed", "expired"].includes(normalized)) {
    return "FAILED";
  }
  if (normalized === "refunded") {
    return "REFUNDED";
  }
  return "PENDING";
}

function stringifyPayload(payload: unknown) {
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

function logFedaPayExchange(label: string, options: {
  url: string;
  headers?: unknown;
  payload?: unknown;
  response?: unknown;
}) {
  console.log(`[FedaPay] ${label}`);
  console.log(`[FedaPay] url: ${options.url}`);
  console.log(`[FedaPay] headers: ${stringifyPayload(options.headers) ?? "null"}`);
  console.log(`[FedaPay] payload: ${stringifyPayload(options.payload) ?? "null"}`);
  console.log(`[FedaPay] reponse: ${stringifyPayload(options.response) ?? "null"}`);
}

export async function createFedaPayCheckout(params: {
  payment: Payment;
  user: User;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isFedaPayConfigured()) {
    throw new Error("FedaPay is not configured on this server.");
  }

  const amount = Math.round(Number(params.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid payment amount.");
  }

  const callbackUrl = buildCallbackUrl(params.payment.id);
  const merchantReference = `PAY-${params.payment.id}`;
  const mode = String(process.env.FEDAPAY_PAYMENT_MODE || "mtn_open").trim();

  const createPayload = {
    description: params.description,
    amount,
    currency: { iso: String(process.env.FEDAPAY_CURRENCY_ISO || "XOF").trim().toUpperCase() },
    callback_url: callbackUrl,
    merchant_reference: merchantReference,
    mode,
    metadata: {
      paymentId: params.payment.id,
      orderId: params.payment.orderId,
      userId: params.payment.userId,
      ...(params.metadata || {}),
    },
  };
  const createTransactionUrl = `${getFedaPayApiBaseUrl()}/transactions`;

  const transactionResponse = await axios.post<FedaPayTransaction>(
    createTransactionUrl,
    createPayload,
    { headers: getAuthHeaders() },
  );
  logFedaPayExchange("create transaction", {
    url: createTransactionUrl,
    headers: getAuthHeaders(),
    payload: createPayload,
    response: transactionResponse.data,
  });

  const transaction = (
    extractTransactionPayload(transactionResponse.data) ||
    findFirstObjectWithId(transactionResponse.data) ||
    asRecord(transactionResponse.data)
  ) as FedaPayTransaction;
  const transactionId = firstNonEmptyString(
    transaction?.id,
    (transaction as any)?.transaction_id,
    (transaction as any)?.reference,
  );
  if (!transactionId) {
    throw new Error(
      `FedaPay transaction id missing. transaction=${stringifyPayload(transaction)} payload=${stringifyPayload(transactionResponse.data)}`
    );
  }
  const tokenUrl = `${getFedaPayApiBaseUrl()}/transactions/${transactionId}/token`;

  const tokenResponse = await axios.post<{ token?: string; url?: string }>(
    tokenUrl,
    {},
    { headers: getAuthHeaders() },
  );
  logFedaPayExchange("create token", {
    url: tokenUrl,
    headers: getAuthHeaders(),
    payload: {},
    response: tokenResponse.data,
  });

  const tokenPayload = extractTokenPayload(tokenResponse.data);

  return {
    callbackUrl,
    merchantReference,
    customerId: null,
    transaction,
    transactionId,
    checkoutToken: firstNonEmptyString(
      tokenPayload.token,
      tokenPayload.checkout_token,
      tokenPayload.payment_token,
    ),
    checkoutUrl: firstNonEmptyString(
      tokenPayload.url,
      tokenPayload.payment_url,
      tokenPayload.checkout_url,
      tokenPayload.redirect_url,
    ),
  };
}

export async function retrieveFedaPayTransaction(transactionId: string | number) {
  const normalizedId = String(transactionId || "").trim();
  if (!normalizedId) {
    throw new Error("Missing FedaPay transaction id.");
  }
  const transactionUrl = `${getFedaPayApiBaseUrl()}/transactions/${normalizedId}`;

  const response = await axios.get<FedaPayTransaction>(
    transactionUrl,
    { headers: getAuthHeaders() },
  );
  logFedaPayExchange("retrieve transaction", {
    url: transactionUrl,
    headers: getAuthHeaders(),
    response: response.data,
  });
  return extractTransactionPayload(response.data) as FedaPayTransaction;
}

export async function syncPaymentWithFedaPay(payment: Payment) {
  const providerTransactionId = String(payment.get("providerTransactionId") || "").trim();
  if (!providerTransactionId) {
    return payment;
  }

  const transaction = await retrieveFedaPayTransaction(providerTransactionId);
  const localStatus = mapProviderStatusToLocalStatus(transaction.status as string | undefined);

  payment.set("status", localStatus);
  payment.set("providerReference", String(transaction.reference || "").trim() || null);
  payment.set("rawProviderPayload", stringifyPayload(transaction));
  payment.set("failureReason", localStatus === "FAILED" ? String(transaction.status || "failed") : null);
  if (localStatus === "PAID") {
    payment.set("paidAt", transaction.approved_at ? new Date(String(transaction.approved_at)) : new Date());
  }
  await payment.save();
  return payment;
}

export function extractFedaPayTransactionIdFromWebhook(payload: any) {
  const candidates = [
    payload?.data?.id,
    payload?.data?.entity?.id,
    payload?.entity?.id,
    payload?.transaction?.id,
    payload?.id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }
  return "";
}

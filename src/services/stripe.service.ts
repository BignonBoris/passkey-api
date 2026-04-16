import axios from "axios";
import crypto from "crypto";
import Payment from "../models/payment.model";
import User from "../models/user.model";

function getStripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

function getStripeWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

function getStripeApiBaseUrl() {
  return "https://api.stripe.com/v1";
}

function getAppBaseUrl() {
  return (
    process.env.STRIPE_CALLBACK_BASE_URL ||
    process.env.APP_BASE_URL ||
    `http://localhost:${process.env.PORT || 3000}`
  ).replace(/\/+$/, "");
}

function buildStripeCallbackUrl(paymentId: string, kind: "success" | "cancel") {
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/api/payments/stripe/callback?paymentId=${encodeURIComponent(paymentId)}&result=${kind}&session_id={CHECKOUT_SESSION_ID}`;
}

function buildFallbackEmail(user: User) {
  const existing = String(user.get("email") || "").trim();
  if (existing) return existing;
  const phoneDigits = String(user.get("phone") || "").replace(/[^\d]/g, "").trim();
  const suffix =
    phoneDigits || String(user.get("id") || "client").replace(/[^a-zA-Z0-9]/g, "");
  return `client-${suffix}@passkey.example.com`;
}

function stringifyPayload(payload: unknown) {
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

function mapStripeSessionToLocalStatus(session: Record<string, unknown>) {
  const paymentStatus = String(session.payment_status || "").trim().toLowerCase();
  const sessionStatus = String(session.status || "").trim().toLowerCase();

  if (paymentStatus === "paid") return "PAID";
  if (["expired", "complete"].includes(sessionStatus) && paymentStatus === "unpaid") {
    return "FAILED";
  }
  return "PENDING";
}

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${getStripeSecretKey()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

export function isStripeConfigured() {
  return getStripeSecretKey().length > 0;
}

export async function createStripeCheckout(params: {
  payment: Payment;
  user: User;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isStripeConfigured()) {
    throw new Error("Stripe n'est pas configure sur ce serveur.");
  }

  const amount = Math.max(100, Math.round(Number(params.amount || 0)));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montant de paiement invalide.");
  }

  const sessionPayload = new URLSearchParams();
  sessionPayload.append("mode", "payment");
  sessionPayload.append("success_url", buildStripeCallbackUrl(params.payment.id, "success"));
  sessionPayload.append("cancel_url", buildStripeCallbackUrl(params.payment.id, "cancel"));
  sessionPayload.append("payment_method_types[0]", "card");
  sessionPayload.append("client_reference_id", params.payment.id);
  sessionPayload.append("line_items[0][quantity]", "1");
  sessionPayload.append("line_items[0][price_data][currency]", "xof");
  sessionPayload.append("line_items[0][price_data][unit_amount]", amount.toString());
  sessionPayload.append("line_items[0][price_data][product_data][name]", params.description);
  sessionPayload.append("line_items[0][price_data][product_data][description]", params.description);
  sessionPayload.append("customer_email", buildFallbackEmail(params.user));
  sessionPayload.append("metadata[paymentId]", params.payment.id);
  sessionPayload.append("metadata[orderId]", params.payment.orderId);
  sessionPayload.append("metadata[userId]", params.payment.userId);

  for (const [key, value] of Object.entries(params.metadata || {})) {
    if (value === undefined || value === null) continue;
    sessionPayload.append(`metadata[${key}]`, String(value));
  }

  const response = await axios.post(
    `${getStripeApiBaseUrl()}/checkout/sessions`,
    sessionPayload.toString(),
    { headers: getAuthHeaders() },
  );

  const session = response.data as Record<string, unknown>;
  return {
    session,
    sessionId: String(session.id || "").trim(),
    checkoutUrl: String(session.url || "").trim(),
    successUrl: buildStripeCallbackUrl(params.payment.id, "success"),
    cancelUrl: buildStripeCallbackUrl(params.payment.id, "cancel"),
  };
}

export async function syncPaymentWithStripe(payment: Payment) {
  if (!isStripeConfigured()) {
    throw new Error("Stripe n'est pas configure sur ce serveur.");
  }

  const sessionId = String(payment.get("providerTransactionId") || "").trim();
  if (!sessionId) {
    throw new Error("L'identifiant de session Stripe est manquant sur ce paiement.");
  }

  const response = await axios.get(
    `${getStripeApiBaseUrl()}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${getStripeSecretKey()}`,
      },
      params: {
        "expand[]": "payment_intent",
      },
    },
  );

  const session = response.data as Record<string, unknown>;
  const nextStatus = mapStripeSessionToLocalStatus(session);
  const paymentIntent = session.payment_intent as Record<string, unknown> | string | null | undefined;

  payment.set("provider", "STRIPE");
  payment.set("status", nextStatus);
  payment.set("failureReason", nextStatus === "FAILED" ? "Checkout Stripe expire ou non confirme" : null);
  payment.set("rawProviderPayload", stringifyPayload(session));
  payment.set("checkoutUrl", String(session.url || payment.get("checkoutUrl") || "").trim() || null);

  if (typeof paymentIntent === "string" && paymentIntent.trim()) {
    payment.set("providerReference", paymentIntent.trim());
  } else if (paymentIntent && typeof paymentIntent === "object") {
    const paymentIntentId = String(paymentIntent.id || "").trim();
    if (paymentIntentId) {
      payment.set("providerReference", paymentIntentId);
    }
  }

  if (nextStatus === "PAID" && !payment.get("paidAt")) {
    payment.set("paidAt", new Date());
  }

  await payment.save();
  return payment;
}

function verifyStripeSignature(rawBody: string, signatureHeader: string) {
  const secret = getStripeWebhookSecret();
  if (!secret) {
    throw new Error("Le secret du webhook Stripe est manquant.");
  }

  const fragments = signatureHeader.split(",").map((item) => item.trim());
  const timestamp = fragments.find((fragment) => fragment.startsWith("t="))?.slice(2) || "";
  const signatures = fragments
    .filter((fragment) => fragment.startsWith("v1="))
    .map((fragment) => fragment.slice(3))
    .filter(Boolean);

  if (!timestamp || !signatures.length) {
    throw new Error("L'entete de signature Stripe est invalide.");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const isValid = signatures.some((signature) => {
    const receivedBuffer = Buffer.from(signature, "hex");
    return receivedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  });

  if (!isValid) {
    throw new Error("La signature du webhook Stripe est invalide.");
  }

  const eventTimestamp = Number(timestamp);
  if (Number.isFinite(eventTimestamp)) {
    const ageSeconds = Math.abs(Date.now() / 1000 - eventTimestamp);
    if (ageSeconds > 300) {
      throw new Error("L'horodatage de la signature du webhook Stripe est trop ancien.");
    }
  }
}

export function constructStripeEventFromWebhook(rawBody: string, signatureHeader: string) {
  verifyStripeSignature(rawBody, signatureHeader);
  return JSON.parse(rawBody) as Record<string, unknown>;
}

export function extractStripeSessionIdFromWebhook(event: Record<string, unknown>) {
  const data = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : {};
  const object = data.object && typeof data.object === "object"
    ? (data.object as Record<string, unknown>)
    : {};
  return String(object.id || "").trim();
}

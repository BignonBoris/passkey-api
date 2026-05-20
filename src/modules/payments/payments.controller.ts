import { Response } from "express";
import Order from "../../models/order.model";
import Payment from "../../models/payment.model";
import User from "../../models/user.model";
import { AuthenticatedRequest } from "../../types/auth-request";
import axios from "axios";
import {
  createFedaPayCheckout,
  extractFedaPayTransactionIdFromWebhook,
  isFedaPayConfigured,
  syncPaymentWithFedaPay,
} from "../../services/fedapay.service";
import {
  createStripeOffSessionPayment,
  constructStripeEventFromWebhook,
  createStripeCheckout,
  extractSavedStripeCardDetails,
  extractStripeSessionIdFromWebhook,
  isStripeConfigured,
  syncPaymentWithStripe,
} from "../../services/stripe.service";
import { sendPushNotification } from "../../services/notification.service";
import DriverRevenueConfig from "../../models/driver-revenue-config.model";
import { calculateCourseRevenueSettlement } from "../../services/revenue.service";
import { applyDriverAccountMovement } from "../driver-funding/driver-funding.service";
import { generateUniqueOrderPublicCode } from "../../utils/orderPublicCode";
import { resolveCountryId } from "../../services/country.service";
import { startDriverSearchForOrder } from "../order/order.controller";

function normalizeRole(role: unknown) {
  return String(role || "").trim().toLowerCase();
}

function canAccessOrderPayment(params: {
  requesterId?: string | null;
  requesterRole?: string | null;
  payment?: Payment | null;
  order?: Order | null;
}) {
  const requesterId = String(params.requesterId || "").trim();
  const requesterRole = normalizeRole(params.requesterRole);
  if (!requesterId) return false;

  const paymentUserId = String(params.payment?.get("userId") || "").trim();
  const paymentDriverId = String(params.payment?.get("driverId") || "").trim();
  const orderUserId = String(params.order?.get("userId") || "").trim();
  const orderDriverId = String(params.order?.get("driverId") || "").trim();

  if (paymentUserId === requesterId || orderUserId === requesterId) {
    return true;
  }

  if (
    (paymentDriverId === requesterId || orderDriverId === requesterId) &&
    ["livreur", "driver", "admin", "sous-admin"].includes(requesterRole)
  ) {
    return true;
  }

  return ["admin", "sous-admin"].includes(requesterRole);
}

function generateCompletionOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeRemotePaymentMethod(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "CARD" || normalized === "STRIPE") return "CARD";
  if (normalized === "MOBILE_MONEY") return "MOBILE_MONEY";
  return "CASH";
}

function isRemotePaymentMethod(value: unknown) {
  const normalized = normalizeRemotePaymentMethod(value);
  return normalized === "MOBILE_MONEY" || normalized === "CARD";
}

function resolvePaymentProvider(payment: Payment) {
  const provider = String(payment.get("provider") || "").trim().toUpperCase();
  if (provider === "STRIPE") return "STRIPE";
  if (provider === "FEDAPAY") return "FEDAPAY";

  const method = normalizeRemotePaymentMethod(payment.get("method"));
  if (method === "CARD") return "STRIPE";
  if (method === "MOBILE_MONEY") return "FEDAPAY";
  return "";
}

function formatPaymentMethodLabel(paymentMethod: string) {
  if (paymentMethod === "CARD") return "par carte";
  if (paymentMethod === "MOBILE_MONEY") return "par mobile money";
  return "en especes";
}

function paymentResponse(payment: Payment) {
  return {
    id: payment.get("id"),
    orderId: payment.get("orderId"),
    userId: payment.get("userId"),
    driverId: payment.get("driverId"),
    amount: payment.get("amount"),
    currency: payment.get("currency"),
    status: payment.get("status"),
    method: payment.get("method"),
    provider: payment.get("provider"),
    providerTransactionId: payment.get("providerTransactionId"),
    providerReference: payment.get("providerReference"),
    merchantReference: payment.get("merchantReference"),
    checkoutUrl: payment.get("checkoutUrl"),
    callbackUrl: payment.get("callbackUrl"),
    paidAt: payment.get("paidAt"),
    failureReason: payment.get("failureReason"),
    callbackReceivedAt: payment.get("callbackReceivedAt"),
    revenueAppliedAt: payment.get("revenueAppliedAt"),
    appliedDriverRevenue: payment.get("appliedDriverRevenue"),
    appliedPlatformShare: payment.get("appliedPlatformShare"),
    createdAt: payment.get("createdAt"),
    updatedAt: payment.get("updatedAt"),
  };
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "oui", "on"].includes(normalized);
}

function savedStripeCardResponse(user: User | null) {
  if (!user) return null;
  const paymentMethodId = String(user.get("stripeDefaultPaymentMethodId") || "").trim();
  if (!paymentMethodId) return null;
  return {
    hasSavedCard: true,
    brand: String(user.get("stripeDefaultPaymentBrand") || "").trim() || null,
    last4: String(user.get("stripeDefaultPaymentLast4") || "").trim() || null,
    expMonth: Number(user.get("stripeDefaultPaymentExpMonth") || 0) || null,
    expYear: Number(user.get("stripeDefaultPaymentExpYear") || 0) || null,
    savedAt: user.get("stripeDefaultPaymentSavedAt") || null,
  };
}

async function persistSavedStripeCardFromPayment(params: {
  payment: Payment;
  user: User;
}) {
  const rawPayload = String(params.payment.get("rawProviderPayload") || "").trim();
  if (!rawPayload) return;

  let payload: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(rawPayload);
    if (parsed && typeof parsed === "object") {
      payload = parsed as Record<string, unknown>;
    }
  } catch (_) {
    payload = null;
  }
  if (!payload) return;

  const shouldSave =
    String(payload.metadata && typeof payload.metadata === "object"
      ? (payload.metadata as Record<string, unknown>).savePaymentMethodForFuture || ""
      : "",
    )
      .trim()
      .toLowerCase() === "true";
  if (!shouldSave) return;

  const details = extractSavedStripeCardDetails(payload);
  if (!details) return;

  params.user.set("stripeCustomerId", details.customerId);
  params.user.set("stripeDefaultPaymentMethodId", details.paymentMethodId);
  params.user.set("stripeDefaultPaymentBrand", details.brand);
  params.user.set("stripeDefaultPaymentLast4", details.last4);
  params.user.set("stripeDefaultPaymentExpMonth", details.expMonth);
  params.user.set("stripeDefaultPaymentExpYear", details.expYear);
  params.user.set("stripeDefaultPaymentSavedAt", new Date());
  await params.user.save();
}

async function resolveDriverRevenueConfigForOrder(order: Order) {
  const vehicleType = String(order.get("vehicleType") || "").trim().toLowerCase();
  const countryId = await resolveCountryId(String(order.get("countryId") || ""));
  if (!vehicleType) return null;

  return (
    await DriverRevenueConfig.findOne({ where: { vehicleType, countryId } })
  ) ?? (
    await DriverRevenueConfig.findOne({ where: { vehicleType } })
  );
}

async function applyRevenueSettlementIfNeeded(params: {
  payment: Payment;
  order: Order;
}) {
  const { payment, order } = params;
  const currentStatus = String(payment.get("status") || "").trim().toUpperCase();
  if (currentStatus !== "PAID") return;
  if (payment.get("revenueAppliedAt")) return;

  const driverId = String(order.get("driverId") || payment.get("driverId") || "").trim();
  if (!driverId) return;

  const config = await resolveDriverRevenueConfigForOrder(order);
  if (!config) return;

  let courseAmount = Number(payment.get("amount") || order.get("price") || 0);
  const flowType = String(order.get("flowType") || "STANDARD").trim().toUpperCase();
  if (flowType === "RETURN") {
    try {
      const context = JSON.parse(String(order.get("returnContextJson") || "{}")) as Record<string, unknown>;
      const revenueBaseAmount = Number(context.revenueBaseAmount ?? context.returnAmount ?? 0);
      if (Number.isFinite(revenueBaseAmount) && revenueBaseAmount > 0) {
        courseAmount = revenueBaseAmount;
      }
    } catch (_) {}
  }
  const settlement = calculateCourseRevenueSettlement(config, { courseAmount });

  if (settlement.driverRevenue > 0) {
    const paymentMethod = String(payment.get("method") || "CASH").trim().toUpperCase();
    const action = paymentMethod === "MOBILE_MONEY" ? "ADD" : "SUBTRACT";
    const movementAmount =
      paymentMethod === "MOBILE_MONEY"
        ? settlement.driverRevenue
        : settlement.platformShare;

    if (movementAmount > 0) {
      await applyDriverAccountMovement(driverId, movementAmount, action);
    }
  } else if (settlement.platformShare > 0) {
    const paymentMethod = String(payment.get("method") || "CASH").trim().toUpperCase();
    if (paymentMethod === "CASH") {
      await applyDriverAccountMovement(driverId, settlement.platformShare, "SUBTRACT");
    }
  }

  order.set("revenuePerDelivery", settlement.driverRevenue);
  order.set("platformCommission", settlement.platformShare);
  order.set("serviceFee", 0);
  await order.save();

  payment.set("revenueAppliedAt", new Date());
  payment.set("appliedDriverRevenue", settlement.driverRevenue);
  payment.set("appliedPlatformShare", settlement.platformShare);
  await payment.save();
}

async function findOrderPayment(orderId: string, userId?: string) {
  const where: Record<string, unknown> = { orderId };
  if (userId) where.userId = userId;
  return Payment.findOne({
    where,
    order: [["createdAt", "DESC"]],
  });
}

async function emitPaymentStatusChanged(
  req: AuthenticatedRequest,
  params: {
    payment: Payment;
    order: Order;
    actorRole?: string;
    event?: string;
  }
) {
  const { payment, order, actorRole, event } = params;
  const io = (req as any).io;
  const payload = {
    event: event ?? "PAYMENT_STATUS_UPDATED",
    orderId: String(order.get("id") || ""),
    paymentId: String(payment.get("id") || ""),
    paymentStatus: String(payment.get("status") || "PENDING"),
    paymentMethod: String(payment.get("method") || "CASH"),
    amount: Number(payment.get("amount") || order.get("price") || 0),
    currency: String(payment.get("currency") || "XOF"),
    paidAt: payment.get("paidAt"),
    checkoutUrl: payment.get("checkoutUrl"),
    actorRole: actorRole || null,
    pickupAddress: String(order.get("pickupAddress") || ""),
    destinationAddress: String(order.get("destinationAddress") || ""),
    paymentPromptDeadlineAt: order.get("paymentPromptDeadlineAt") || null,
    paymentCheckoutStartedAt: order.get("paymentCheckoutStartedAt") || null,
    paymentPromptAttemptCount: Number(order.get("paymentPromptAttemptCount") || 0),
    paymentCheckoutStatus: order.get("paymentCheckoutStatus") || null,
  };

  io?.to(`user_${order.get("userId")}`).emit("payment_status_changed", payload);
  const driverId = String(order.get("driverId") || payment.get("driverId") || "").trim();
  if (driverId) {
    io?.to(`user_${driverId}`).emit("payment_status_changed", payload);
  }
}

async function emitPaymentCheckoutRequested(
  req: AuthenticatedRequest,
  params: {
    payment: Payment;
    order: Order;
    actorRole?: string;
  }
) {
  const { payment, order, actorRole } = params;
  const io = (req as any).io;
  const payload = {
    event: "PAYMENT_CHECKOUT_REQUESTED",
    orderId: String(order.get("id") || ""),
    paymentId: String(payment.get("id") || ""),
    paymentStatus: String(payment.get("status") || "PENDING"),
    paymentMethod: String(payment.get("method") || "MOBILE_MONEY"),
    checkoutUrl: String(payment.get("checkoutUrl") || ""),
    amount: Number(payment.get("amount") || order.get("price") || 0),
    currency: String(payment.get("currency") || "XOF"),
    actorRole: actorRole || null,
    pickupAddress: String(order.get("pickupAddress") || ""),
    destinationAddress: String(order.get("destinationAddress") || ""),
    paymentPromptDeadlineAt: order.get("paymentPromptDeadlineAt") || null,
    paymentCheckoutStartedAt: order.get("paymentCheckoutStartedAt") || null,
    paymentPromptAttemptCount: Number(order.get("paymentPromptAttemptCount") || 0),
    paymentCheckoutStatus: order.get("paymentCheckoutStatus") || null,
  };

  io?.to(`user_${order.get("userId")}`).emit("payment_checkout_requested", payload);

  const user = await User.findByPk(String(order.get("userId") || ""));
  const userToken = String(user?.get("fcmToken") || "").trim();
  if (userToken) {
    await sendPushNotification(
      userToken,
      "Paiement en attente",
      "Veuillez finaliser le paiement pour lancer la recherche du livreur.",
      {
        type: "PAYMENT_CHECKOUT_REQUESTED",
        orderId: String(order.get("id") || ""),
        paymentId: String(payment.get("id") || ""),
        paymentStatus: String(payment.get("status") || "PENDING"),
        paymentMethod: String(payment.get("method") || "MOBILE_MONEY"),
        checkoutUrl: String(payment.get("checkoutUrl") || ""),
        route: "/maps",
      }
    );
  }
}

async function reconcileOrderAfterPaymentUpdate(
  req: AuthenticatedRequest,
  params: {
    payment: Payment;
    order: Order;
  },
) {
  const { payment, order } = params;
  const nextStatus = String(payment.get("status") || "").trim().toUpperCase();

  if (nextStatus === "PAID") {
    const previousCheckoutStatus = String(
      order.get("paymentCheckoutStatus") || "",
    )
      .trim()
      .toUpperCase();
    const shouldStartDeferredSearch =
      isRemotePaymentMethod(payment.get("method")) &&
      String(order.get("status") || "").trim().toUpperCase() === "PENDING" &&
      !String(order.get("driverId") || "").trim() &&
      previousCheckoutStatus !== "PAID";

    order.set("paymentPromptDeadlineAt", null);
    order.set("paymentCheckoutStartedAt", null);
    order.set("paymentCheckoutStatus", "PAID");
    if (shouldStartDeferredSearch) {
      order.set("searchStartedAt", new Date());
    }
    await order.save();

    if (shouldStartDeferredSearch) {
      const io = (req as any).io;
      await startDriverSearchForOrder({
        order,
        io,
        paymentRow: payment,
      });
    }
    return;
  }

  if (nextStatus !== "FAILED") return;

  const attemptCount = Number(order.get("paymentPromptAttemptCount") || 0);
  if (attemptCount >= 2) {
    order.set("status", "CANCELLED");
    order.set("cancelledAt", new Date());
    order.set("cancelledBy", "SYSTEM");
    order.set(
      "cancellationReason",
      "Le paiement a echoue apres deux tentatives.",
    );
    order.set("paymentPromptDeadlineAt", null);
    order.set("paymentCheckoutStartedAt", null);
    order.set("paymentCheckoutStatus", "FAILED_FINAL");
    await order.save();

    const driverId = String(order.get("driverId") || "").trim();
    if (driverId) {
      await User.update({ isAvailable: true }, { where: { id: driverId } });
    }

    const io = (req as any).io;
    const cancellationPayload = {
      orderId: String(order.get("id") || ""),
      status: "CANCELLED",
      cancelledBy: "SYSTEM",
      cancellationReason: "Le paiement a echoue apres deux tentatives.",
      payment_method: String(payment.get("method") || "CASH"),
      payment_status: nextStatus,
      paymentPromptDeadlineAt: null,
      paymentCheckoutStartedAt: null,
      paymentPromptAttemptCount: attemptCount,
      paymentCheckoutStatus: "FAILED_FINAL",
    };
    io?.to(`user_${order.get("userId")}`).emit(
      "order_status_changed",
      cancellationPayload,
    );
    if (driverId) {
      io?.to(`user_${driverId}`).emit(
        "order_status_changed",
        cancellationPayload,
      );
    }
    return;
  }

  order.set("paymentPromptDeadlineAt", new Date(Date.now() + 3 * 60 * 1000));
  order.set("paymentCheckoutStartedAt", null);
  order.set("paymentPromptAttemptCount", attemptCount + 1);
  order.set("paymentCheckoutStatus", "FAILED_RETRY_ALLOWED");
  await order.save();
}

async function notifyPaymentEvent(
  req: AuthenticatedRequest,
  params: {
    payment: Payment;
    order: Order;
    previousStatus?: string | null;
    actorRole?: string;
    sourceEvent?: string;
  }
) {
  const { payment, order, previousStatus, actorRole, sourceEvent } = params;
  const currentStatus = String(payment.get("status") || "").trim().toUpperCase();
  const previous = String(previousStatus || "").trim().toUpperCase();
  const paymentMethod = String(payment.get("method") || "CASH").trim().toUpperCase();

  await emitPaymentStatusChanged(req, {
    payment,
    order,
    actorRole,
    event: sourceEvent,
  });

  const user = await User.findByPk(String(order.get("userId") || ""));
  const driverId = String(order.get("driverId") || payment.get("driverId") || "").trim();
  const driver = driverId ? await User.findByPk(driverId) : null;
  const userToken = String(user?.get("fcmToken") || "").trim();
  const driverToken = String(driver?.get("fcmToken") || "").trim();

  if (currentStatus === "PAID" && previous !== "PAID") {
    await applyRevenueSettlementIfNeeded({ payment, order });

    if (isRemotePaymentMethod(paymentMethod) && driverToken) {
      await sendPushNotification(
        driverToken,
        "Paiement confirme",
        `Le paiement ${formatPaymentMethodLabel(paymentMethod)} de la course a ete confirme.`,
        {
          type: "ORDER_PAYMENT_CONFIRMED",
          orderId: String(order.get("id") || ""),
          paymentId: String(payment.get("id") || ""),
          paymentMethod,
          paymentStatus: currentStatus,
          route: "/delivery",
        }
      );
    }

    if (paymentMethod === "CASH" && userToken) {
      await sendPushNotification(
        userToken,
        "Paiement en especes confirme",
        "Le livreur a confirme la reception du paiement de votre course.",
        {
          type: "ORDER_CASH_PAYMENT_CONFIRMED",
          orderId: String(order.get("id") || ""),
          paymentId: String(payment.get("id") || ""),
          paymentMethod,
          paymentStatus: currentStatus,
          route: "/app",
        }
      );
    }
    return;
  }

  if (paymentMethod === "CASH" && currentStatus === "PENDING" && actorRole === "user" && driverToken) {
    await sendPushNotification(
      driverToken,
      "Paiement en especes attendu",
      "Le client a choisi un reglement en especes pour cette course.",
      {
        type: "ORDER_CASH_PAYMENT_SELECTED",
        orderId: String(order.get("id") || ""),
        paymentId: String(payment.get("id") || ""),
        paymentMethod,
        paymentStatus: currentStatus,
        route: "/delivery",
      }
    );
  }
}

export async function createTestPaymentCheckout(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    if (!isFedaPayConfigured()) {
      return res.status(503).json({
        success: false,
        message: "FedaPay n'est pas configure sur ce serveur.",
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }

    const amount = Math.max(100, Math.round(Number(req.body?.amount || 250)));
    const description = String(req.body?.description || "Paiement test PassKey").trim();

    const order = await Order.create({
      publicCode: await generateUniqueOrderPublicCode("PAY"),
      userId,
      pickupLocation: "6.3703,2.3912",
      pickupAddress: "Paiement test - Depart",
      destinationLocation: "6.3654,2.4183",
      destinationAddress: "Paiement test - Arrivee",
      distance: "1 km",
      price: amount,
      revenuePerDelivery: 0,
      platformCommission: 0,
      serviceFee: 0,
      completionOtp: generateCompletionOtp(),
      vehicleType: "test-payment",
      status: "PENDING",
      isArchived: true,
    });

    const payment = await Payment.create({
      orderId: String(order.get("id")),
      userId,
      driverId: null,
      amount,
      currency: "XOF",
      status: "PENDING",
      method: "MOBILE_MONEY",
      provider: "FEDAPAY",
      customerEmail: String(user.get("email") || "").trim() || null,
      customerPhone: String(user.get("phone") || "").trim() || null,
    });

    const checkout = await createFedaPayCheckout({
      payment,
      user,
      amount,
      description,
      metadata: { source: "mobile-home-test" },
    });

    payment.set("providerTransactionId", checkout.transactionId);
    payment.set("providerReference", String(checkout.transaction.reference || "").trim() || null);
    payment.set("merchantReference", checkout.merchantReference);
    payment.set("checkoutUrl", checkout.checkoutUrl || null);
    payment.set("checkoutToken", checkout.checkoutToken || null);
    payment.set("callbackUrl", checkout.callbackUrl);
    payment.set("rawProviderPayload", JSON.stringify(checkout.transaction));
    await payment.save();

    return res.status(201).json({
      success: true,
      message: "Checkout FedaPay cree",
      data: {
        payment: paymentResponse(payment),
        checkoutUrl: checkout.checkoutUrl,
        checkoutToken: checkout.checkoutToken,
      },
    });
  } catch (error) {
    const details = axios.isAxiosError(error)
      ? error.response?.data ?? error.message
      : error instanceof Error
          ? error.message
          : "Impossible de creer le paiement test";
    return res.status(500).json({
      success: false,
      message: typeof details === "string" ? details : JSON.stringify(details),
    });
  }
}

export async function createOrderPaymentCheckout(req: AuthenticatedRequest, res: Response) {
  try {
    const requesterId = req.user?.id;
    const actorRole = normalizeRole(req.user?.role);
    if (!requesterId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required" });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    const orderUserId = String(order.get("userId") || "").trim();
    const orderDriverId = String(order.get("driverId") || "").trim();
    const isUserRequester = orderUserId === requesterId;
    const isAssignedDriverRequester =
      orderDriverId === requesterId && ["livreur", "driver", "admin", "sous-admin"].includes(actorRole);

    if (!isUserRequester && !isAssignedDriverRequester) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

    const user = await User.findByPk(orderUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }

    let payment = await Payment.findOne({
      where: { orderId, userId: orderUserId },
      order: [["createdAt", "DESC"]],
    });

    if (!payment) {
      payment = await Payment.create({
        orderId,
        userId: orderUserId,
        driverId: orderDriverId || null,
        amount: Number(order.get("price") || 0),
        currency: "XOF",
        status: "PENDING",
        method: "MOBILE_MONEY",
        provider: "FEDAPAY",
        customerEmail: null,
        customerPhone: String(user.get("phone") || "").trim() || null,
      });
    }

    const paymentMethod = normalizeRemotePaymentMethod(payment.get("method"));
    if (paymentMethod === "CASH") {
      return res.status(400).json({
        success: false,
        message: "Le paiement en ligne n'est pas disponible pour une course en especes.",
      });
    }

    if (String(payment.get("status")) === "PAID") {
      return res.status(200).json({
        success: true,
        message: "Paiement deja effectue",
        data: {
          payment: paymentResponse(payment),
          checkoutUrl: null,
          checkoutToken: null,
        },
      });
    }

    const amount = Math.max(100, Math.round(Number(payment.get("amount") || order.get("price") || 0)));
    const description = String(req.body?.description || `Paiement course PassKey ${orderId}`).trim();
    const savePaymentMethodForFuture =
      paymentMethod === "CARD" && toBoolean(req.body?.savePaymentMethodForFuture);
    payment.set("driverId", orderDriverId || null);
    payment.set("amount", amount);
    payment.set("status", "PENDING");
    payment.set("method", paymentMethod);
    payment.set("customerEmail", String(user.get("email") || "").trim() || null);
    payment.set("customerPhone", String(user.get("phone") || "").trim() || null);
    payment.set("failureReason", null);

    let responsePayload: {
      checkoutUrl: string | null;
      checkoutToken: string | null;
      message: string;
      autoPaid?: boolean;
    };
    const previousOrderCheckoutStatus = String(
      order.get("paymentCheckoutStatus") || "",
    )
      .trim()
      .toUpperCase();

    if (paymentMethod === "MOBILE_MONEY") {
      if (!isFedaPayConfigured()) {
        return res.status(503).json({
          success: false,
          message: "FedaPay n'est pas configure sur ce serveur.",
        });
      }

      const checkout = await createFedaPayCheckout({
        payment,
        user,
        amount,
        description,
        metadata: { source: "order-payment-checkout" },
      });

      payment.set("provider", "FEDAPAY");
      payment.set("providerTransactionId", checkout.transactionId);
      payment.set("providerReference", String(checkout.transaction.reference || "").trim() || null);
      payment.set("merchantReference", checkout.merchantReference);
      payment.set("checkoutUrl", checkout.checkoutUrl || null);
      payment.set("checkoutToken", checkout.checkoutToken || null);
      payment.set("callbackUrl", checkout.callbackUrl);
      payment.set("rawProviderPayload", JSON.stringify(checkout.transaction));
      responsePayload = {
        checkoutUrl: checkout.checkoutUrl || null,
        checkoutToken: checkout.checkoutToken || null,
        message: "Checkout FedaPay cree",
      };
    } else {
      if (!isStripeConfigured()) {
        return res.status(503).json({
          success: false,
          message: "Stripe n'est pas configure sur ce serveur.",
        });
      }

      const autoCharge = await createStripeOffSessionPayment({
        payment,
        user,
        amount,
        description,
        metadata: { source: "order-payment-auto-charge" },
      });

      if (autoCharge.success) {
        payment.set("provider", "STRIPE");
        payment.set("providerTransactionId", String(autoCharge.paymentIntent.id || "").trim() || null);
        payment.set("providerReference", String(autoCharge.paymentIntent.id || "").trim() || null);
        payment.set("merchantReference", `STRIPE-${payment.get("id")}`);
        payment.set("checkoutUrl", null);
        payment.set("checkoutToken", null);
        payment.set("callbackUrl", null);
        payment.set("rawProviderPayload", JSON.stringify(autoCharge.paymentIntent));
        payment.set("status", "PAID");
        payment.set("paidAt", new Date());
        payment.set("failureReason", null);

        order.set("paymentCheckoutStartedAt", null);
        order.set("paymentPromptDeadlineAt", null);
        order.set("paymentCheckoutStatus", "PAID");
        await order.save();
        await payment.save();

        const shouldStartDeferredSearch =
          String(order.get("status") || "").trim().toUpperCase() ===
            "PENDING" &&
          !String(order.get("driverId") || "").trim() &&
          previousOrderCheckoutStatus !== "PAID";
        if (shouldStartDeferredSearch) {
          order.set("searchStartedAt", new Date());
          await order.save();
          await startDriverSearchForOrder({
            order,
            io: (req as any).io,
            paymentRow: payment,
          });
        }

        await notifyPaymentEvent(req, {
          payment,
          order,
          previousStatus: "PENDING",
          actorRole,
          sourceEvent: "PAYMENT_AUTO_CHARGED",
        });

        return res.status(200).json({
          success: true,
          message: "Paiement automatique effectue avec la carte enregistree.",
          data: {
            payment: paymentResponse(payment),
            checkoutUrl: null,
            checkoutToken: null,
            autoPaid: true,
            savedCard: savedStripeCardResponse(user),
          },
        });
      }

      const checkout = await createStripeCheckout({
        payment,
        user,
        amount,
        description,
        metadata: { source: "order-payment-checkout" },
        savePaymentMethodForFuture,
      });

      payment.set("provider", "STRIPE");
      payment.set("providerTransactionId", checkout.sessionId);
      payment.set("providerReference", null);
      payment.set("merchantReference", `STRIPE-${payment.get("id")}`);
      payment.set("checkoutUrl", checkout.checkoutUrl || null);
      payment.set("checkoutToken", null);
      payment.set("callbackUrl", checkout.successUrl);
      payment.set("rawProviderPayload", JSON.stringify(checkout.session));
      responsePayload = {
        checkoutUrl: checkout.checkoutUrl || null,
        checkoutToken: null,
        message: "Checkout Stripe cree",
      };
    }

    order.set("paymentCheckoutStartedAt", new Date());
    order.set("paymentPromptDeadlineAt", null);
    order.set("paymentCheckoutStatus", "IN_PROGRESS");
    await order.save();
    await payment.save();

    await emitPaymentCheckoutRequested(req, {
      payment,
      order,
      actorRole,
    });
    await notifyPaymentEvent(req, {
      payment,
      order,
      previousStatus: null,
      actorRole,
      sourceEvent: "PAYMENT_CHECKOUT_REQUESTED",
    });

    return res.status(201).json({
      success: true,
      message: responsePayload.message,
      data: {
        payment: paymentResponse(payment),
        checkoutUrl: responsePayload.checkoutUrl,
        checkoutToken: responsePayload.checkoutToken,
        autoPaid: responsePayload.autoPaid ?? false,
        savedCard: savedStripeCardResponse(user),
      },
    });
  } catch (error) {
    const details = axios.isAxiosError(error)
      ? error.response?.data ?? error.message
      : error instanceof Error
          ? error.message
          : "Impossible de creer le paiement";
    return res.status(500).json({
      success: false,
      message: typeof details === "string" ? details : JSON.stringify(details),
    });
  }
}

export async function getPaymentStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;
    if (!requesterId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const payment = await Payment.findByPk(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Paiement introuvable" });
    }

    const order = await Order.findByPk(String(payment.get("orderId") || ""));
    if (!canAccessOrderPayment({ requesterId, requesterRole, payment, order })) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

    return res.status(200).json({
      success: true,
      data: paymentResponse(payment),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Impossible de charger le paiement" });
  }
}

export async function getStripeSavedCard(req: AuthenticatedRequest, res: Response) {
  try {
    const requesterId = String(req.user?.id || "").trim();
    if (!requesterId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const user = await User.findByPk(requesterId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }

    return res.status(200).json({
      success: true,
      data: savedStripeCardResponse(user) ?? { hasSavedCard: false },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Impossible de charger la carte Stripe",
    });
  }
}

export async function syncPaymentStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;
    if (!requesterId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const payment = await Payment.findByPk(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Paiement introuvable" });
    }

    const order = await Order.findByPk(String(payment.get("orderId") || ""));
    if (!canAccessOrderPayment({ requesterId, requesterRole, payment, order })) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

      const previousStatus = String(payment.get("status") || "").trim().toUpperCase();
      const provider = resolvePaymentProvider(payment);
      if (provider === "FEDAPAY") {
        await syncPaymentWithFedaPay(payment);
      } else if (provider === "STRIPE") {
        await syncPaymentWithStripe(payment);
        if (order) {
          const user = await User.findByPk(String(order.get("userId") || ""));
          if (user) {
            await persistSavedStripeCardFromPayment({ payment, user });
          }
        }
      }
    if (order) {
      await reconcileOrderAfterPaymentUpdate(req, { payment, order });
      await notifyPaymentEvent(req, {
        payment,
        order,
        previousStatus,
        actorRole: normalizeRole(req.user?.role),
        sourceEvent: "PAYMENT_SYNCED",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Statut synchronise",
      data: paymentResponse(payment),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Impossible de synchroniser le paiement",
    });
  }
}

export async function handleFedaPayCallback(req: AuthenticatedRequest, res: Response) {
  try {
    const paymentId = String(req.query.paymentId || "").trim();
    if (paymentId) {
      const payment = await Payment.findByPk(paymentId);
      if (payment) {
        const previousStatus = String(payment.get("status") || "").trim().toUpperCase();
        payment.set("callbackReceivedAt", new Date());
        await payment.save();
        await syncPaymentWithFedaPay(payment);
        const order = await Order.findByPk(String(payment.get("orderId") || ""));
        if (order) {
          await reconcileOrderAfterPaymentUpdate(req, { payment, order });
          await notifyPaymentEvent(req, {
            payment,
            order,
            previousStatus,
            sourceEvent: "PAYMENT_CALLBACK",
          });
        }
      }
    }

    const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PassKey Paiement</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0d47a1; color: white; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
      .card { background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:24px; padding:24px; width:min(90vw,420px); }
      h1 { margin:0 0 12px; font-size:24px; }
      p { margin:0; line-height:1.5; color: rgba(255,255,255,.88); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Paiement traite</h1>
      <p>Vous pouvez revenir dans l'application PassKey. Le statut de votre paiement est en cours de synchronisation.</p>
    </div>
  </body>
</html>`;
    res.status(200).contentType("text/html").send(html);
  } catch {
    res.status(200).contentType("text/html").send("<h1>Retour a PassKey</h1>");
  }
}

export async function handleStripeCallback(req: AuthenticatedRequest, res: Response) {
  try {
    const paymentId = String(req.query.paymentId || "").trim();
    const sessionId = String(req.query.session_id || "").trim();
    if (paymentId) {
      const payment = await Payment.findByPk(paymentId);
      if (payment) {
        const previousStatus = String(payment.get("status") || "").trim().toUpperCase();
        payment.set("callbackReceivedAt", new Date());
        if (sessionId) {
          payment.set("providerTransactionId", sessionId);
        }
          await payment.save();
          await syncPaymentWithStripe(payment);
          const order = await Order.findByPk(String(payment.get("orderId") || ""));
          if (order) {
            const user = await User.findByPk(String(order.get("userId") || ""));
            if (user) {
              await persistSavedStripeCardFromPayment({ payment, user });
            }
            await reconcileOrderAfterPaymentUpdate(req, { payment, order });
            await notifyPaymentEvent(req, {
              payment,
            order,
            previousStatus,
            sourceEvent: "PAYMENT_CALLBACK",
          });
        }
      }
    }

    const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PassKey Paiement</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0d47a1; color: white; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
      .card { background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:24px; padding:24px; width:min(90vw,420px); }
      h1 { margin:0 0 12px; font-size:24px; }
      p { margin:0; line-height:1.5; color: rgba(255,255,255,.88); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Paiement traite</h1>
      <p>Vous pouvez revenir dans l'application PassKey. Le statut de votre paiement Stripe est en cours de synchronisation.</p>
    </div>
  </body>
</html>`;
    res.status(200).contentType("text/html").send(html);
  } catch {
    res.status(200).contentType("text/html").send("<h1>Retour a PassKey</h1>");
  }
}

export async function handleFedaPayWebhook(req: AuthenticatedRequest, res: Response) {
  try {
    const rawPayload =
      Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    const payload = typeof req.body === "object" && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawPayload || "{}");

    const transactionId = extractFedaPayTransactionIdFromWebhook(payload);
    if (!transactionId) {
      return res.status(200).json({ success: true, message: "Aucun identifiant de transaction trouve" });
    }

    const payment = await Payment.findOne({
      where: { providerTransactionId: transactionId },
    });
    if (!payment) {
      return res.status(200).json({ success: true, message: "Paiement introuvable" });
    }

    const previousStatus = String(payment.get("status") || "").trim().toUpperCase();
    payment.set("callbackReceivedAt", new Date());
    payment.set("rawProviderPayload", rawPayload);
    await payment.save();
    await syncPaymentWithFedaPay(payment);
    const order = await Order.findByPk(String(payment.get("orderId") || ""));
    if (order) {
      await reconcileOrderAfterPaymentUpdate(req, { payment, order });
      await notifyPaymentEvent(req, {
        payment,
        order,
        previousStatus,
        sourceEvent: "PAYMENT_WEBHOOK",
      });
    }

    return res.status(200).json({ success: true });
  } catch {
    return res.status(200).json({ success: true });
  }
}

export async function handleStripeWebhook(req: AuthenticatedRequest, res: Response) {
  try {
    const rawPayload =
      Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    const signatureHeader = String(req.headers["stripe-signature"] || "").trim();
    if (!signatureHeader) {
      return res.status(400).json({ success: false, message: "Signature Stripe manquante" });
    }

    const event = constructStripeEventFromWebhook(rawPayload, signatureHeader);
    const sessionId = extractStripeSessionIdFromWebhook(event);
    if (!sessionId) {
      return res.status(200).json({ success: true, message: "Aucun identifiant de session trouve" });
    }

    const payment = await Payment.findOne({
      where: { providerTransactionId: sessionId },
    });
    if (!payment) {
      return res.status(200).json({ success: true, message: "Paiement introuvable" });
    }

    const previousStatus = String(payment.get("status") || "").trim().toUpperCase();
      payment.set("callbackReceivedAt", new Date());
      payment.set("rawProviderPayload", rawPayload);
      await payment.save();
      await syncPaymentWithStripe(payment);

      const order = await Order.findByPk(String(payment.get("orderId") || ""));
      if (order) {
        const user = await User.findByPk(String(order.get("userId") || ""));
        if (user) {
          await persistSavedStripeCardFromPayment({ payment, user });
        }
        await reconcileOrderAfterPaymentUpdate(req, { payment, order });
        await notifyPaymentEvent(req, {
          payment,
        order,
        previousStatus,
        sourceEvent: "PAYMENT_WEBHOOK",
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Webhook Stripe invalide",
    });
  }
}

export async function selectOrderCashPayment(req: AuthenticatedRequest, res: Response) {
  try {
    const requesterId = req.user?.id;
    const requesterRole = normalizeRole(req.user?.role);
    if (!requesterId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const orderId = String(req.params.orderId || "").trim();
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    const orderUserId = String(order.get("userId") || "").trim();
    const orderDriverId = String(order.get("driverId") || "").trim();
    const isUserRequester = orderUserId == requesterId;
    const isAssignedDriverRequester =
      orderDriverId === requesterId && ["livreur", "driver", "admin", "sous-admin"].includes(requesterRole);

    if (!isUserRequester && !isAssignedDriverRequester) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }
    let payment = await findOrderPayment(orderId, orderUserId);
    if (!payment) {
      payment = await Payment.create({
        orderId,
        userId: orderUserId,
        driverId: orderDriverId || null,
        amount: Math.max(100, Math.round(Number(order.get("price") || 0))),
        currency: "XOF",
        status: "PENDING",
        method: "CASH",
        provider: null,
      });
    } else if (String(payment.get("status") || "").toUpperCase() === "PAID") {
      return res.status(200).json({
        success: true,
        message: "Cette course est deja payee.",
        data: { payment: paymentResponse(payment) },
      });
    } else {
      payment.set("driverId", orderDriverId || null);
      payment.set("amount", Math.max(100, Math.round(Number(order.get("price") || 0))));
      payment.set("status", "PENDING");
      payment.set("method", "CASH");
      payment.set("provider", null);
      payment.set("providerTransactionId", null);
      payment.set("providerReference", null);
      payment.set("merchantReference", null);
      payment.set("checkoutUrl", null);
      payment.set("checkoutToken", null);
      payment.set("callbackUrl", null);
      payment.set("failureReason", null);
      payment.set("rawProviderPayload", null);
      payment.set("paidAt", null);
      await payment.save();
    }

    await notifyPaymentEvent(req, {
      payment,
      order,
      previousStatus: null,
      actorRole: isAssignedDriverRequester ? "driver" : "user",
      sourceEvent: "PAYMENT_METHOD_SELECTED",
    });

    return res.status(200).json({
      success: true,
      message: "Paiement en especes selectionne. Le livreur a ete notifie.",
      data: {
        payment: paymentResponse(payment),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Impossible de definir le paiement en especes",
    });
  }
}

export async function markOrderCashPaymentPaid(req: AuthenticatedRequest, res: Response) {
  try {
    const driverId = req.user?.id;
    const role = normalizeRole(req.user?.role);
    if (!driverId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }
    if (!["livreur", "driver", "admin", "sous-admin"].includes(role)) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

    const orderId = String(req.params.orderId || "").trim();
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    const assignedDriverId = String(order.get("driverId") || "").trim();
    if (assignedDriverId && assignedDriverId !== driverId && !["admin", "sous-admin"].includes(role)) {
      return res.status(403).json({ success: false, message: "Cette course n'est pas attribuee a ce livreur" });
    }

    const payment = await findOrderPayment(orderId, String(order.get("userId") || ""));
    if (!payment) {
      return res.status(404).json({ success: false, message: "Paiement introuvable" });
    }

    const paymentMethod = String(payment.get("method") || "").trim().toUpperCase();
    if (paymentMethod !== "CASH") {
      return res.status(400).json({
        success: false,
        message: "Seules les courses en especes peuvent etre marquees comme payees par le livreur",
      });
    }

    const previousStatus = String(payment.get("status") || "").trim().toUpperCase();
    if (previousStatus === "PAID") {
      return res.status(200).json({
        success: true,
        message: "Cette course est deja marquee comme payee.",
        data: { payment: paymentResponse(payment) },
      });
    }

    payment.set("driverId", assignedDriverId || driverId);
    payment.set("status", "PAID");
    payment.set("paidAt", new Date());
    payment.set("failureReason", null);
    await payment.save();

    await notifyPaymentEvent(req, {
      payment,
      order,
      previousStatus,
      actorRole: "driver",
      sourceEvent: "PAYMENT_MARKED_PAID",
    });

    return res.status(200).json({
      success: true,
      message: "Paiement en especes confirme.",
      data: {
        payment: paymentResponse(payment),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Impossible de confirmer le paiement en especes",
    });
  }
}

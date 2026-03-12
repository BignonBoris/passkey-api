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

function generateCompletionOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
    createdAt: payment.get("createdAt"),
    updatedAt: payment.get("updatedAt"),
  };
}

export async function createTestPaymentCheckout(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
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
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    if (!isFedaPayConfigured()) {
      return res.status(503).json({
        success: false,
        message: "FedaPay n'est pas configure sur ce serveur.",
      });
    }

    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required" });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    if (String(order.get("userId")) !== userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
    }

    let payment = await Payment.findOne({
      where: { orderId, userId },
      order: [["createdAt", "DESC"]],
    });

    if (!payment) {
      payment = await Payment.create({
        orderId,
        userId,
        driverId: String(order.get("driverId") || "").trim() || null,
        amount: Number(order.get("price") || 0),
        currency: "XOF",
        status: "PENDING",
        method: "MOBILE_MONEY",
        provider: "FEDAPAY",
        customerEmail: null,
        customerPhone: String(user.get("phone") || "").trim() || null,
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
    const checkout = await createFedaPayCheckout({
      payment,
      user,
      amount,
      description,
      metadata: { source: "order-payment-checkout" },
    });

    payment.set("driverId", String(order.get("driverId") || "").trim() || null);
    payment.set("amount", amount);
    payment.set("providerTransactionId", checkout.transactionId);
    payment.set("providerReference", String(checkout.transaction.reference || "").trim() || null);
    payment.set("merchantReference", checkout.merchantReference);
    payment.set("checkoutUrl", checkout.checkoutUrl || null);
    payment.set("checkoutToken", checkout.checkoutToken || null);
    payment.set("callbackUrl", checkout.callbackUrl);
    payment.set("customerEmail", null);
    payment.set("customerPhone", String(user.get("phone") || "").trim() || null);
    payment.set("failureReason", null);
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
        : "Impossible de creer le paiement";
    return res.status(500).json({
      success: false,
      message: typeof details === "string" ? details : JSON.stringify(details),
    });
  }
}

export async function getPaymentStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const payment = await Payment.findByPk(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Paiement introuvable" });
    }

    if (String(payment.get("userId")) !== userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    return res.status(200).json({
      success: true,
      data: paymentResponse(payment),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Impossible de charger le paiement" });
  }
}

export async function syncPaymentStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const payment = await Payment.findByPk(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Paiement introuvable" });
    }

    if (String(payment.get("userId")) !== userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await syncPaymentWithFedaPay(payment);

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
        payment.set("callbackReceivedAt", new Date());
        await payment.save();
        await syncPaymentWithFedaPay(payment);
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

export async function handleFedaPayWebhook(req: AuthenticatedRequest, res: Response) {
  try {
    const rawPayload =
      Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
    const payload = typeof req.body === "object" && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawPayload || "{}");

    const transactionId = extractFedaPayTransactionIdFromWebhook(payload);
    if (!transactionId) {
      return res.status(200).json({ success: true, message: "No transaction id found" });
    }

    const payment = await Payment.findOne({
      where: { providerTransactionId: transactionId },
    });
    if (!payment) {
      return res.status(200).json({ success: true, message: "Payment not found" });
    }

    payment.set("callbackReceivedAt", new Date());
    payment.set("rawProviderPayload", rawPayload);
    await payment.save();
    await syncPaymentWithFedaPay(payment);

    return res.status(200).json({ success: true });
  } catch {
    return res.status(200).json({ success: true });
  }
}

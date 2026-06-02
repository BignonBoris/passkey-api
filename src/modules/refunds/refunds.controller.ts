import { Request, Response } from "express";
import { Op } from "sequelize";
import RefundRequest from "../../models/refund-request.model";
import Payment from "../../models/payment.model";
import Order from "../../models/order.model";
import User from "../../models/user.model";
import { notifyAdmins } from "../../services/admin-notification.service";

const refundIncludes = [
  {
    model: Payment,
    as: "payment",
    attributes: [
      "id",
      "amount",
      "currency",
      "status",
      "method",
      "provider",
      "paidAt",
      "providerReference",
    ],
  },
  {
    model: Order,
    as: "order",
    attributes: [
      "id",
      "publicCode",
      "status",
      "price",
      "vehicleType",
      "pickupAddress",
      "destinationAddress",
      "createdAt",
      "cancelledAt",
      "cancelledBy",
      "cancellationReason",
    ],
  },
  {
    model: User,
    as: "user",
    attributes: ["id", "name", "phone", "email"],
  },
];

type AdminNotificationSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

function resolveRefundSeverity(status: unknown): AdminNotificationSeverity {
  const normalized = String(status || "PENDING").trim().toUpperCase();
  if (normalized === "APPROVED") return "HIGH";
  if (normalized === "PAID") return "MEDIUM";
  if (normalized === "REJECTED") return "HIGH";
  return "MEDIUM";
}

export async function listRefunds(req: Request, res: Response) {
  try {
    const { status, userId, orderId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (userId) whereClause.userId = userId;
    if (orderId) whereClause.orderId = orderId;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const rows = await RefundRequest.findAll({
      where: whereClause,
      include: refundIncludes,
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list refunds" });
  }
}

export async function getRefund(req: Request, res: Response) {
  try {
    const row = await RefundRequest.findByPk(req.params.id, {
      include: refundIncludes,
    });
    if (!row) return res.status(404).json({ success: false, message: "Refund not found" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load refund" });
  }
}

export async function createRefund(req: Request, res: Response) {
  try {
    const { paymentId, orderId, userId, amount, reason } = req.body || {};
    if (!paymentId || !orderId || !userId || amount === undefined) {
      return res.status(400).json({ success: false, message: "paymentId, orderId, userId, amount are required" });
    }
    const row = await RefundRequest.create({
      paymentId,
      orderId,
      userId,
      amount,
      reason: reason || null,
      status: "PENDING",
    });

    await notifyAdmins({
      actorId: null,
      category: "PAYMENT",
      severity: "HIGH",
      eventType: "REFUND_CREATED",
      sourceModule: "REFUNDS",
      title: "Demande de remboursement creee",
      message: `Une demande de remboursement a ete creee pour la course ${orderId}.`,
      entityType: "RefundRequest",
      entityId: String(row.get("id") || "").trim(),
      actionUrl: "/admin/refunds",
      payload: {
        refundRequestId: String(row.get("id") || "").trim(),
        paymentId,
        orderId,
        userId,
        amount,
        reason: reason || null,
      },
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create refund" });
  }
}

export async function updateRefund(req: Request, res: Response) {
  try {
    const { status, reason, processedBy } = req.body || {};
    const row = await RefundRequest.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Refund not found" });

    if (status) row.set("status", status);
    if (reason !== undefined) row.set("reason", reason);
    if (processedBy) row.set("processedBy", processedBy);
    if (status && status !== "PENDING") row.set("processedAt", new Date());

    await row.save();

    await notifyAdmins({
      actorId: processedBy ? String(processedBy).trim() : null,
      category: "PAYMENT",
      severity: resolveRefundSeverity(status || row.get("status")),
      eventType: "REFUND_UPDATED",
      sourceModule: "REFUNDS",
      title: "Remboursement mis a jour",
      message: `Le remboursement ${String(row.get("id") || "").trim()} a ete mis a jour.`,
      entityType: "RefundRequest",
      entityId: String(row.get("id") || "").trim(),
      actionUrl: "/admin/refunds",
      payload: {
        refundRequestId: String(row.get("id") || "").trim(),
        status: String(status || row.get("status") || "").trim().toUpperCase(),
        reason: reason || null,
        processedBy: processedBy || null,
      },
    });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update refund" });
  }
}

export async function deleteRefund(req: Request, res: Response) {
  try {
    const row = await RefundRequest.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Refund not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Refund deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete refund" });
  }
}

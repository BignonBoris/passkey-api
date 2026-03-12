import { Request, Response } from "express";
import { Op } from "sequelize";
import RefundRequest from "../../models/refund-request.model";

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
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list refunds" });
  }
}

export async function getRefund(req: Request, res: Response) {
  try {
    const row = await RefundRequest.findByPk(req.params.id);
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

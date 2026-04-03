import { Request, Response } from "express";
import { Op } from "sequelize";
import Promotion from "../../models/promotion.model";
import PromotionRedemption from "../../models/promotion-redemption.model";

export async function listPromotions(req: Request, res: Response) {
  try {
    const { status, code } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (code) whereClause.code = { [Op.like]: `%${code}%` };

    const rows = await Promotion.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list promotions" });
  }
}

export async function getPromotion(req: Request, res: Response) {
  try {
    const row = await Promotion.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Promotion not found" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load promotion" });
  }
}

export async function createPromotion(req: Request, res: Response) {
  try {
    const { code, status, validFrom, validTo, usageLimit } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: "code is required" });
    const row = await Promotion.create({
      code,
      status: status || "ACTIVE",
      validFrom: validFrom ? new Date(validFrom) : null,
      validTo: validTo ? new Date(validTo) : null,
      usageLimit: usageLimit ?? null,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create promotion" });
  }
}

export async function updatePromotion(req: Request, res: Response) {
  try {
    const { status, validFrom, validTo, usageLimit, usedCount } = req.body || {};
    const row = await Promotion.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Promotion not found" });

    if (status) row.set("status", status);
    if (validFrom !== undefined) row.set("validFrom", validFrom ? new Date(validFrom) : null);
    if (validTo !== undefined) row.set("validTo", validTo ? new Date(validTo) : null);
    if (usageLimit !== undefined) row.set("usageLimit", usageLimit);
    if (usedCount !== undefined) row.set("usedCount", usedCount);

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update promotion" });
  }
}

export async function deletePromotion(req: Request, res: Response) {
  try {
    const row = await Promotion.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Promotion not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Promotion deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete promotion" });
  }
}

export async function listPromotionRedemptions(req: Request, res: Response) {
  try {
    const { promotionId, userId, orderId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};
    if (promotionId) whereClause.promotionId = promotionId;
    if (userId) whereClause.userId = userId;
    if (orderId) whereClause.orderId = orderId;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const rows = await PromotionRedemption.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list promotion redemptions" });
  }
}

export async function createPromotionRedemption(req: Request, res: Response) {
  try {
    const { promotionId, userId, orderId, amount } = req.body || {};
    if (!promotionId || !userId) {
      return res.status(400).json({ success: false, message: "promotionId and userId are required" });
    }
    const row = await PromotionRedemption.create({
      promotionId,
      userId,
      orderId: orderId || null,
      amount: amount ?? 0,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create promotion redemption" });
  }
}

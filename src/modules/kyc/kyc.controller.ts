import { Request, Response } from "express";
import { Op } from "sequelize";
import KycRequest from "../../models/kyc-request.model";
import User from "../../models/user.model";

export async function listKycRequests(req: Request, res: Response) {
  try {
    const { status, type, userId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};

    if (status) whereClause.status = status;
    if (type) whereClause.type = type;
    if (userId) whereClause.userId = userId;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const rows = await KycRequest.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list KYC requests" });
  }
}

export async function getKycRequest(req: Request, res: Response) {
  try {
    const row = await KycRequest.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "KYC request not found" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load KYC request" });
  }
}

export async function createKycRequest(req: Request, res: Response) {
  try {
    const { userId, type } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, message: "userId is required" });
    const row = await KycRequest.create({
      userId,
      type: type || "KYC",
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create KYC request" });
  }
}

export async function updateKycRequest(req: Request, res: Response) {
  try {
    const { status, reason, reviewedBy } = req.body || {};
    const row = await KycRequest.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "KYC request not found" });

    if (status) row.set("status", status);
    if (reason !== undefined) row.set("reason", reason);
    if (reviewedBy) row.set("reviewedBy", reviewedBy);
    if (status && status !== "PENDING") row.set("reviewedAt", new Date());

    await row.save();

    if (status === "APPROVED" || status === "REJECTED") {
      await User.update(
        { identityVerified: status === "APPROVED" },
        { where: { id: row.get("userId") } }
      );
    }

    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update KYC request" });
  }
}

export async function deleteKycRequest(req: Request, res: Response) {
  try {
    const row = await KycRequest.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "KYC request not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "KYC request deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete KYC request" });
  }
}

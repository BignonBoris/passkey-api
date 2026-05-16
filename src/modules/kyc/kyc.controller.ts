import { Request, Response } from "express";
import { Op } from "sequelize";
import KycRequest from "../../models/kyc-request.model";
import User from "../../models/user.model";
import { sendPushNotification, sendSmsNotification } from "../../services/notification.service";

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
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "phone", "email", "identityVerified"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list KYC requests" });
  }
}

export async function getKycRequest(req: Request, res: Response) {
  try {
    const row = await KycRequest.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: "user",
        },
      ],
    });
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
      const userId = row.get("userId");
      // 1. Update user verification status
      await User.update(
        { 
          identityVerified: status === "APPROVED",
          kycRejectionReason: status === "REJECTED" ? reason : null
        },
        { where: { id: userId } }
      );

      // 2. Sync all driver documents to the same status
      const DriverDocument = (await import("../../models/driver-document.model")).default;
      await DriverDocument.update(
        { status: status },
        { where: { userId: userId } }
      );

      // 3. Notify the driver
      const user = await User.findByPk(userId);
      if (user) {
        const io = (req as any).io;
        const identityVerified = status === "APPROVED";
        
        // Socket.io real-time update
        if (io) {
          io.to(`user_${userId}`).emit("driver:verification_updated", {
            id: userId,
            identityVerified,
            kycRejectionReason: status === "REJECTED" ? reason : null
          });
          
          // Re-emit general profile update to refresh UI lists if needed
          const safeUser = user.toJSON();
          delete (safeUser as any).password;
          io.to("drivers").emit("driver:profile_updated", safeUser);
        }

        // Notifications (Push & SMS)
        const notificationTitle = status === "APPROVED" ? "Dossier validé !" : "Dossier à corriger";
        const notificationMessage = status === "APPROVED" 
          ? "Félicitations, votre dossier a été validé. Vous pouvez maintenant commencer à travailler."
          : `Votre dossier a été rejeté. Motif : ${reason || "Informations non conformes"}.`;

        const fcmToken = user.get("fcmToken");
        if (fcmToken && fcmToken !== "undefined") {
          await sendPushNotification(
            String(fcmToken),
            notificationTitle,
            notificationMessage,
            {
              type: status === "APPROVED" ? "KYC_APPROVED" : "KYC_REJECTED",
              userId,
              reason: reason || "",
              createdAt: new Date().toISOString()
            }
          ).catch(e => console.error("Push error:", e));
        }

        const phone = user.get("phone");
        if (phone) {
          const smsText = `PassKey: ${notificationTitle}. ${notificationMessage}`;
          await sendSmsNotification(String(phone), smsText).catch(e => console.error("SMS error:", e));
        }
      }
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


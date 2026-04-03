import { Request, Response } from "express";
import { Op } from "sequelize";
import NotificationLog from "../../models/notification-log.model";

export async function listNotificationLogs(req: Request, res: Response) {
  try {
    const { status, channel, recipientId, eventType, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (channel) whereClause.channel = channel;
    if (recipientId) whereClause.recipientId = recipientId;
    if (eventType) whereClause.eventType = eventType;
    if (dateFrom || dateTo) {
      whereClause.sentAt = {};
      if (dateFrom) whereClause.sentAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.sentAt[Op.lte] = new Date(dateTo);
    }

    const rows = await NotificationLog.findAll({
      where: whereClause,
      order: [["sentAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list notifications" });
  }
}

export async function getNotificationLog(req: Request, res: Response) {
  try {
    const row = await NotificationLog.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Notification not found" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load notification" });
  }
}

export async function createNotificationLog(req: Request, res: Response) {
  try {
    const { recipientId, channel, status, templateId, eventType, sentAt } = req.body || {};
    if (!recipientId || !channel) {
      return res.status(400).json({ success: false, message: "recipientId and channel are required" });
    }
    const row = await NotificationLog.create({
      recipientId,
      channel,
      status: status || "SENT",
      templateId: templateId || null,
      eventType: eventType || null,
      sentAt: sentAt ? new Date(sentAt) : new Date(),
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create notification" });
  }
}

export async function updateNotificationLog(req: Request, res: Response) {
  try {
    const { status } = req.body || {};
    const row = await NotificationLog.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Notification not found" });

    if (status) row.set("status", status);
    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update notification" });
  }
}

export async function deleteNotificationLog(req: Request, res: Response) {
  try {
    const row = await NotificationLog.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Notification not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Notification deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete notification" });
  }
}

import { Request, Response } from "express";
import { Op } from "sequelize";
import Incident from "../../models/incident.model";

export async function listIncidents(req: Request, res: Response) {
  try {
    const { status, priority, type, driverId, orderId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;
    if (type) whereClause.type = type;
    if (driverId) whereClause.driverId = driverId;
    if (orderId) whereClause.orderId = orderId;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const rows = await Incident.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list incidents" });
  }
}

export async function getIncident(req: Request, res: Response) {
  try {
    const row = await Incident.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Incident not found" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load incident" });
  }
}

export async function createIncident(req: Request, res: Response) {
  try {
    const { orderId, driverId, type, priority } = req.body || {};
    if (!type) return res.status(400).json({ success: false, message: "type is required" });
    const row = await Incident.create({
      orderId: orderId || null,
      driverId: driverId || null,
      type,
      priority: priority || "MEDIUM",
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create incident" });
  }
}

export async function updateIncident(req: Request, res: Response) {
  try {
    const { status, priority, resolvedAt } = req.body || {};
    const row = await Incident.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Incident not found" });

    if (status) row.set("status", status);
    if (priority) row.set("priority", priority);
    if (resolvedAt !== undefined) row.set("resolvedAt", resolvedAt ? new Date(resolvedAt) : null);
    if (status && (status === "RESOLVED" || status === "CLOSED")) row.set("resolvedAt", new Date());

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update incident" });
  }
}

export async function deleteIncident(req: Request, res: Response) {
  try {
    const row = await Incident.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Incident not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Incident deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete incident" });
  }
}

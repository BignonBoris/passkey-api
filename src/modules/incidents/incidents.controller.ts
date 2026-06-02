import { Request, Response } from "express";
import { Op } from "sequelize";
import Incident from "../../models/incident.model";
import Order from "../../models/order.model";
import User from "../../models/user.model";
import Payment from "../../models/payment.model";
import { AuthenticatedRequest } from "../../types/auth-request";
import { notifyAdmins } from "../../services/admin-notification.service";

const DRIVER_INCIDENT_TYPES = [
  "CUSTOMER_UNREACHABLE",
  "ADDRESS_ISSUE",
  "CUSTOMER_REFUSAL",
  "SAFETY_ISSUE",
  "VEHICLE_ISSUE",
  "PACKAGE_ISSUE",
  "CASH_UNPAID",
  "OTHER",
] as const;

function normalizeIncidentType(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return normalized || "OTHER";
}

function normalizeIncidentPriority(value: unknown): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const normalized = String(value || "MEDIUM").trim().toUpperCase();
  if (normalized === "LOW" || normalized === "HIGH" || normalized === "CRITICAL") {
    return normalized;
  }
  return "MEDIUM";
}

function parseCoordinate(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseEvidence(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed || null;
  }
  try {
    return JSON.stringify(input);
  } catch (_) {
    return null;
  }
}

type AdminNotificationSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

function resolveIncidentSeverity(priority: unknown): AdminNotificationSeverity {
  const normalized = String(priority || "MEDIUM").trim().toUpperCase();
  if (normalized === "CRITICAL") return "CRITICAL";
  if (normalized === "HIGH") return "HIGH";
  if (normalized === "LOW") return "LOW";
  return "MEDIUM";
}

export async function listIncidents(req: Request, res: Response) {
  try {
    const { status, priority, type, driverId, orderId, dateFrom, dateTo, reporterRole } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;
    if (type) whereClause.type = type;
    if (driverId) whereClause.driverId = driverId;
    if (orderId) whereClause.orderId = orderId;
    if (reporterRole) whereClause.reporterRole = reporterRole;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const rows = await Incident.findAll({
      where: whereClause,
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["id", "publicCode", "status", "paymentPromptDeadlineAt", "createdAt"],
        },
        {
          model: User,
          as: "driver",
          attributes: ["id", "name", "phone"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list incidents" });
  }
}

export async function getIncident(req: Request, res: Response) {
  try {
    const row = await Incident.findByPk(req.params.id, {
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["id", "publicCode", "status", "pickupAddress", "destinationAddress", "createdAt"],
        },
        {
          model: User,
          as: "driver",
          attributes: ["id", "name", "phone"],
        },
      ],
    });
    if (!row) return res.status(404).json({ success: false, message: "Incident not found" });
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load incident" });
  }
}

export async function createIncident(req: AuthenticatedRequest, res: Response) {
  try {
    const { orderId, driverId, type, priority, description, reporterRole, latitude, longitude, evidence, resolutionNotes } = req.body || {};
    if (!type) return res.status(400).json({ success: false, message: "type is required" });
    const row = await Incident.create({
      orderId: orderId || null,
      driverId: driverId || null,
      reporterRole: String(reporterRole || "ADMIN").trim().toUpperCase(),
      type: normalizeIncidentType(type),
      priority: normalizeIncidentPriority(priority),
      description: String(description || "").trim() || null,
      resolutionNotes: String(resolutionNotes || "").trim() || null,
      latitude: parseCoordinate(latitude),
      longitude: parseCoordinate(longitude),
      evidenceJson: parseEvidence(evidence),
    });

    await notifyAdmins({
      actorId: String(req.user?.id || "").trim() || null,
      category: "INCIDENT",
      severity: resolveIncidentSeverity(priority),
      eventType: "INCIDENT_CREATED",
      sourceModule: "INCIDENTS",
      title: "Incident enregistre",
      message: `Un incident ${String(type).trim().toUpperCase()} a ete enregistre${orderId ? ` pour la course ${String(orderId).trim()}` : ""}.`,
      entityType: "Incident",
      entityId: String(row.get("id") || "").trim(),
      actionUrl: "/admin/incidents",
      payload: {
        incidentId: String(row.get("id") || "").trim(),
        orderId: orderId || null,
        driverId: driverId || null,
        priority: resolveIncidentSeverity(priority),
        type: normalizeIncidentType(type),
      },
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create incident" });
  }
}

export async function reportDriverIncident(req: AuthenticatedRequest, res: Response) {
  try {
    const driverId = String(req.user?.id || "").trim();
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!driverId || role !== "livreur") {
      return res.status(403).json({ success: false, message: "Acces refuse." });
    }

    const orderId = String(req.body?.orderId || "").trim();
    const description = String(req.body?.description || "").trim();
    const type = normalizeIncidentType(req.body?.type);
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId est obligatoire." });
    }
    if (!description) {
      return res.status(400).json({ success: false, message: "La description est obligatoire." });
    }
    if (!DRIVER_INCIDENT_TYPES.includes(type as (typeof DRIVER_INCIDENT_TYPES)[number])) {
      return res.status(400).json({ success: false, message: "Type d'incident invalide." });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable." });
    }
    if (String(order.get("driverId") || "").trim() !== driverId) {
      return res.status(403).json({ success: false, message: "Cette course n'est pas assignee a ce livreur." });
    }
    const orderStatus = String(order.get("status") || "").trim().toUpperCase();
    if (["COMPLETED", "CANCELLED"].includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Le signalement standard n'est disponible que pendant une course active.",
      });
    }

    const row = await Incident.create({
      orderId,
      driverId,
      reporterRole: "DRIVER",
      type,
      priority: normalizeIncidentPriority(req.body?.priority),
      description,
      latitude: parseCoordinate(req.body?.latitude),
      longitude: parseCoordinate(req.body?.longitude),
      evidenceJson: parseEvidence(req.body?.evidence),
    });

    await notifyAdmins({
      actorId: driverId,
      category: "INCIDENT",
      severity: resolveIncidentSeverity(req.body?.priority || "HIGH"),
      eventType: "DRIVER_INCIDENT_REPORTED",
      sourceModule: "INCIDENTS",
      title: "Incident declare par un livreur",
      message: `Le livreur a signale un incident de type ${type} pour la course ${orderId}.`,
      entityType: "Incident",
      entityId: String(row.get("id") || "").trim(),
      actionUrl: "/admin/incidents",
      payload: {
        incidentId: String(row.get("id") || "").trim(),
        orderId,
        driverId,
        type,
        priority: String(req.body?.priority || "HIGH").trim().toUpperCase(),
        description,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Incident signale avec succes.",
      data: row,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de signaler l'incident." });
  }
}

export async function reportCashUnpaidIncident(req: AuthenticatedRequest, res: Response) {
  try {
    const driverId = String(req.user?.id || "").trim();
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!driverId || role !== "livreur") {
      return res.status(403).json({ success: false, message: "Acces refuse." });
    }

    const orderId = String(req.body?.orderId || "").trim();
    const description = String(req.body?.description || "").trim();
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId est obligatoire." });
    }
    if (!description) {
      return res.status(400).json({ success: false, message: "Precisez le contexte de l'impaye." });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable." });
    }
    if (String(order.get("driverId") || "").trim() !== driverId) {
      return res.status(403).json({ success: false, message: "Cette course n'est pas assignee a ce livreur." });
    }

    const payment = await Payment.findOne({
      where: { orderId },
      order: [["createdAt", "DESC"]],
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Paiement introuvable pour cette course." });
    }

    const paymentMethod = String(payment.get("method") || "").trim().toUpperCase();
    const paymentStatus = String(payment.get("status") || "").trim().toUpperCase();
    if (paymentMethod !== "CASH") {
      return res.status(400).json({ success: false, message: "Ce signalement ne concerne que les courses cash." });
    }
    if (paymentStatus === "PAID") {
      return res.status(400).json({ success: false, message: "Le paiement cash est deja confirme." });
    }

    const existingOpen = await Incident.findOne({
      where: {
        orderId,
        driverId,
        type: "CASH_UNPAID",
        status: {
          [Op.in]: ["OPEN", "IN_PROGRESS"],
        },
      },
    });
    if (existingOpen) {
      return res.status(200).json({
        success: true,
        message: "Un incident d'impaye est deja ouvert pour cette course.",
        data: existingOpen,
      });
    }

    const evidence = {
      paymentMethod,
      paymentStatus,
      note: description,
      ...((req.body?.evidence && typeof req.body.evidence === "object") ? req.body.evidence : {}),
    };

    const row = await Incident.create({
      orderId,
      driverId,
      reporterRole: "DRIVER",
      type: "CASH_UNPAID",
      priority: normalizeIncidentPriority(req.body?.priority || "HIGH"),
      description,
      latitude: parseCoordinate(req.body?.latitude),
      longitude: parseCoordinate(req.body?.longitude),
      evidenceJson: parseEvidence(evidence),
    });

    await notifyAdmins({
      actorId: driverId,
      category: "PAYMENT",
      severity: "CRITICAL",
      eventType: "CASH_UNPAID_REPORTED",
      sourceModule: "INCIDENTS",
      title: "Course cash non payee",
      message: `Le livreur a signale une course cash non payee pour la course ${orderId}.`,
      entityType: "Incident",
      entityId: String(row.get("id") || "").trim(),
      actionUrl: "/admin/incidents",
      payload: {
        incidentId: String(row.get("id") || "").trim(),
        orderId,
        driverId,
        paymentMethod,
        paymentStatus,
        description,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Impayé cash signale. La course peut etre cloturee, puis traitee par l'administration.",
      data: row,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de signaler l'impaye cash." });
  }
}

export async function updateIncident(req: Request, res: Response) {
  try {
    const { status, priority, resolvedAt, resolutionNotes, description } = req.body || {};
    const row = await Incident.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Incident not found" });

    if (status) row.set("status", status);
    if (priority) row.set("priority", priority);
    if (description !== undefined) row.set("description", String(description || "").trim() || null);
    if (resolutionNotes !== undefined) row.set("resolutionNotes", String(resolutionNotes || "").trim() || null);
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

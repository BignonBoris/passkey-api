import { Op } from "sequelize";
import { Request, Response } from "express";
import AdminNotification from "../../models/admin-notification.model";
import User from "../../models/user.model";
import { PRIVILEGED_ROLES } from "../../constants/roles";
import { AuthenticatedRequest } from "../../types/auth-request";
import { notifyAdmins, serializeAdminNotification } from "../../services/admin-notification.service";

function getCurrentRecipientId(req: AuthenticatedRequest) {
  return String(req.user?.id || "").trim();
}

function parseBooleanLike(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "oui", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "non", "off"].includes(normalized)) return false;
  return null;
}

function isAllFilterValue(value: unknown) {
  return String(value || "").trim().toLowerCase() === "all";
}

function buildWhereClause(req: AuthenticatedRequest) {
  const recipientId = getCurrentRecipientId(req);
  const {
    read,
    severity,
    category,
    eventType,
    sourceModule,
    entityType,
    entityId,
    dateFrom,
    dateTo,
    search,
  } = req.query as Record<string, string | undefined>;

  const whereClause: any = {
    recipientId,
  };

  const readFilter = parseBooleanLike(read);
  if (String(read || "").trim().toLowerCase() === "read" || readFilter === true) {
    whereClause.isRead = true;
  } else if (String(read || "").trim().toLowerCase() === "unread" || readFilter === false) {
    whereClause.isRead = false;
  }

  if (severity && !isAllFilterValue(severity)) whereClause.severity = severity;
  if (category && !isAllFilterValue(category)) whereClause.category = category;
  if (eventType && !isAllFilterValue(eventType)) whereClause.eventType = eventType;
  if (sourceModule && !isAllFilterValue(sourceModule)) whereClause.sourceModule = sourceModule;
  if (entityType && !isAllFilterValue(entityType)) whereClause.entityType = entityType;
  if (entityId) whereClause.entityId = entityId;

  if (dateFrom || dateTo) {
    whereClause.createdAt = {};
    if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
    if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
  }

  if (search) {
    const term = String(search).trim();
    if (term) {
      whereClause[Op.or] = [
        { title: { [Op.like]: `%${term}%` } },
        { message: { [Op.like]: `%${term}%` } },
        { eventType: { [Op.like]: `%${term}%` } },
        { category: { [Op.like]: `%${term}%` } },
        { sourceModule: { [Op.like]: `%${term}%` } },
        { entityType: { [Op.like]: `%${term}%` } },
        { entityId: { [Op.like]: `%${term}%` } },
      ];
    }
  }

  return whereClause;
}

export async function listAdminNotifications(req: AuthenticatedRequest, res: Response) {
  try {
    const recipientId = getCurrentRecipientId(req);
    if (!recipientId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20) || 20));
    const offset = (page - 1) * limit;
    const whereClause = buildWhereClause(req);

    const { rows, count } = await AdminNotification.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "actor",
          attributes: ["id", "name", "email", "role"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const unreadCount = await AdminNotification.count({
      where: {
        recipientId,
        isRead: false,
      },
    });

    return res.status(200).json({
      success: true,
      data: await Promise.all(rows.map((row) => serializeAdminNotification(row))),
      meta: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit)),
        unreadCount,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de charger les notifications",
    });
  }
}

export async function getAdminNotificationUnreadCount(req: AuthenticatedRequest, res: Response) {
  try {
    const recipientId = getCurrentRecipientId(req);
    if (!recipientId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const unreadCount = await AdminNotification.count({
      where: {
        recipientId,
        isRead: false,
      },
    });

    return res.status(200).json({
      success: true,
      data: { unreadCount },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de compter les notifications",
    });
  }
}

export async function getAdminNotificationById(req: AuthenticatedRequest, res: Response) {
  try {
    const recipientId = getCurrentRecipientId(req);
    const row = await AdminNotification.findOne({
      where: {
        id: req.params.id,
        recipientId,
      },
      include: [
        {
          model: User,
          as: "actor",
          attributes: ["id", "name", "email", "role"],
          required: false,
        },
      ],
    });

    if (!row) {
      return res.status(404).json({ success: false, message: "Notification introuvable" });
    }

    return res.status(200).json({
      success: true,
      data: await serializeAdminNotification(row),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de charger la notification",
    });
  }
}

export async function createAdminNotification(req: AuthenticatedRequest, res: Response) {
  try {
    const authId = getCurrentRecipientId(req);
    if (!authId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }
    const created = await notifyAdmins({
      actorId: authId,
      category: String(req.body?.category || "SYSTEM"),
      severity: String(req.body?.severity || "MEDIUM") as any,
      eventType: String(req.body?.eventType || "MANUAL_NOTIFICATION"),
      sourceModule: String(req.body?.sourceModule || "ADMIN"),
      title: String(req.body?.title || "").trim() || "Notification",
      message: String(req.body?.message || "").trim() || "Notification admin",
      entityType: req.body?.entityType ? String(req.body.entityType) : null,
      entityId: req.body?.entityId ? String(req.body.entityId) : null,
      actionUrl: req.body?.actionUrl ? String(req.body.actionUrl) : null,
      payload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : null,
      recipientIds: Array.isArray(req.body?.recipientIds) ? req.body.recipientIds.map((value: unknown) => String(value || "").trim()).filter(Boolean) : undefined,
      targetRoles: Array.isArray(req.body?.targetRoles)
        ? req.body.targetRoles
            .map((role: unknown) => String(role || "").trim())
            .filter(
              (role: string): role is (typeof PRIVILEGED_ROLES)[number] =>
                PRIVILEGED_ROLES.includes(role as (typeof PRIVILEGED_ROLES)[number])
            )
        : undefined,
    });

    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de creer la notification",
    });
  }
}

export async function markAdminNotificationAsRead(req: AuthenticatedRequest, res: Response) {
  try {
    const recipientId = getCurrentRecipientId(req);
    if (!recipientId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const row = await AdminNotification.findOne({
      where: {
        id: req.params.id,
        recipientId,
      },
    });

    if (!row) {
      return res.status(404).json({ success: false, message: "Notification introuvable" });
    }

    if (!row.get("isRead")) {
      row.set("isRead", true);
      row.set("readAt", new Date());
      await row.save();
    }

    return res.status(200).json({
      success: true,
      data: await serializeAdminNotification(row),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de marquer la notification comme lue",
    });
  }
}

export async function markAllAdminNotificationsAsRead(req: AuthenticatedRequest, res: Response) {
  try {
    const recipientId = getCurrentRecipientId(req);
    if (!recipientId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const [affectedCount] = await AdminNotification.update(
      {
        isRead: true,
        readAt: new Date(),
      },
      {
        where: {
          recipientId,
          isRead: false,
        },
      }
    );

    return res.status(200).json({
      success: true,
      data: { affectedCount },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de tout marquer comme lu",
    });
  }
}

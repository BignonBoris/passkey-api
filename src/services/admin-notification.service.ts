import { Op } from "sequelize";
import type { Server } from "socket.io";
import AdminNotification, { AdminNotificationSeverity } from "../models/admin-notification.model";
import User from "../models/user.model";
import { PRIVILEGED_ROLES, type UserRole } from "../constants/roles";
import { getSocketServer } from "../realtime/socket.instance";

export type AdminNotificationPayload = {
  category?: string;
  severity?: AdminNotificationSeverity;
  eventType: string;
  sourceModule?: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  payload?: Record<string, unknown> | null;
  actorId?: string | null;
  targetRoles?: UserRole[];
  recipientIds?: string[];
  io?: Server | null;
};

export type SerializedAdminNotification = {
  id: string;
  recipientId: string;
  actorId: string | null;
  category: string;
  severity: AdminNotificationSeverity;
  eventType: string;
  sourceModule: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  deliveredAt: string;
  createdAt: string;
  updatedAt: string;
  actor?: {
    id: string;
    name: string | null;
    role: string;
    email: string | null;
  } | null;
};

function safeJsonParse(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function serializeNotification(row: AdminNotification): SerializedAdminNotification {
  const plain = row.get({ plain: true }) as Record<string, any>;
  const actor = plain.actor
    ? {
        id: String(plain.actor.id || ""),
        name: plain.actor.name ? String(plain.actor.name) : null,
        role: String(plain.actor.role || ""),
        email: plain.actor.email ? String(plain.actor.email) : null,
      }
    : null;

  return {
    id: String(plain.id || ""),
    recipientId: String(plain.recipientId || ""),
    actorId: plain.actorId ? String(plain.actorId) : null,
    category: String(plain.category || "SYSTEM"),
    severity: (plain.severity || "MEDIUM") as AdminNotificationSeverity,
    eventType: String(plain.eventType || ""),
    sourceModule: String(plain.sourceModule || "SYSTEM"),
    title: String(plain.title || ""),
    message: String(plain.message || ""),
    entityType: plain.entityType ? String(plain.entityType) : null,
    entityId: plain.entityId ? String(plain.entityId) : null,
    actionUrl: plain.actionUrl ? String(plain.actionUrl) : null,
    payload: safeJsonParse(plain.payloadJson),
    isRead: Boolean(plain.isRead),
    readAt: plain.readAt ? new Date(plain.readAt).toISOString() : null,
    deliveredAt: plain.deliveredAt ? new Date(plain.deliveredAt).toISOString() : new Date().toISOString(),
    createdAt: plain.createdAt ? new Date(plain.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: plain.updatedAt ? new Date(plain.updatedAt).toISOString() : new Date().toISOString(),
    actor,
  };
}

async function resolveRecipients(payload: AdminNotificationPayload) {
  const recipientIds = Array.isArray(payload.recipientIds)
    ? payload.recipientIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (recipientIds.length > 0) {
    return User.findAll({
      where: {
        id: { [Op.in]: recipientIds },
      },
      attributes: ["id", "role", "name", "email"],
    });
  }

  const targetRoles = payload.targetRoles?.length ? payload.targetRoles : PRIVILEGED_ROLES;
  return User.findAll({
    where: {
      role: { [Op.in]: targetRoles },
      isActive: true,
    },
    attributes: ["id", "role", "name", "email"],
  });
}

export async function notifyAdmins(payload: AdminNotificationPayload) {
  const recipients = await resolveRecipients(payload);
  if (!recipients.length) {
    return [];
  }

  const socketServer = payload.io ?? getSocketServer();
  const notifications: SerializedAdminNotification[] = [];
  const basePayloadJson = payload.payload ? safeJsonStringify(payload.payload) : null;
  const seenRecipientIds = new Set<string>();

  for (const recipient of recipients) {
    const recipientId = String(recipient.get("id") || "").trim();
    if (!recipientId || seenRecipientIds.has(recipientId)) {
      continue;
    }
    seenRecipientIds.add(recipientId);

    const row = await AdminNotification.create({
      recipientId,
      actorId: payload.actorId || null,
      category: String(payload.category || "SYSTEM").trim() || "SYSTEM",
      severity: payload.severity || "MEDIUM",
      eventType: String(payload.eventType || "SYSTEM_EVENT").trim(),
      sourceModule: String(payload.sourceModule || "SYSTEM").trim() || "SYSTEM",
      title: String(payload.title || "").trim() || "Notification",
      message: String(payload.message || "").trim() || "Une notification a ete creee.",
      entityType: payload.entityType || null,
      entityId: payload.entityId || null,
      actionUrl: payload.actionUrl || null,
      payloadJson: basePayloadJson,
      isRead: false,
      deliveredAt: new Date(),
    });

    const serialized = serializeNotification(row);
    notifications.push(serialized);
    socketServer?.to(`user_${serialized.recipientId}`).emit("admin_notification:new", serialized);
  }

  return notifications;
}

export async function serializeAdminNotification(row: AdminNotification) {
  return serializeNotification(row);
}

export { serializeNotification as serializeNotificationRow };

import { Response } from "express";
import { Op } from "sequelize";
import SupportTicket from "@/models/support-ticket.model";
import SupportTicketMessage from "@/models/support-ticket-message.model";
import SupportTicketCategory from "@/models/support-ticket-category.model";
import User from "@/models/user.model";
import { AuthenticatedRequest } from "@/types/auth-request";
import { PRIVILEGED_ROLES } from "@/constants/roles";
import { sendPushNotification } from "@/services/notification.service";

const ARCHIVED_CATEGORY_PREFIX = "ARCHIVED|";

function ensureAuth(req: AuthenticatedRequest, res: Response) {
  if (!req.user?.id || !req.user.role) {
    res.status(401).json({ success: false, message: "Unauthenticated" });
    return null;
  }
  return req.user;
}

function isPrivileged(role: string) {
  return PRIVILEGED_ROLES.includes(role as any);
}

function isArchivedCategory(value: unknown) {
  return typeof value === "string" && value.startsWith(ARCHIVED_CATEGORY_PREFIX);
}

function archivedCategoryValue(category: unknown) {
  const safe = typeof category === "string" ? category : "";
  return `${ARCHIVED_CATEGORY_PREFIX}${safe}`;
}

function extractCategory(category: unknown) {
  if (!isArchivedCategory(category)) {
    return typeof category === "string" ? category : null;
  }
  const raw = String(category).slice(ARCHIVED_CATEGORY_PREFIX.length);
  return raw || null;
}

function mapTicketForResponse(ticket: any) {
  const user = ticket.user || null;
  const assignedAdmin = ticket.assignedAdmin || null;
  const rawCategory = ticket.category;
  const archived = isArchivedCategory(rawCategory);
  const messages = Array.isArray(ticket.messages)
    ? ticket.messages.map((msg: any) => ({
        id: msg.id,
        ticketId: msg.ticketId,
        senderId: msg.senderId,
        senderRole: msg.senderRole,
        message: msg.message,
        createdAt: msg.createdAt,
        sender: msg.sender
          ? {
              id: msg.sender.id,
              name: msg.sender.name,
              phone: msg.sender.phone,
              role: msg.sender.role,
            }
          : null,
      }))
    : [];

  return {
    id: ticket.id,
    userId: ticket.userId,
    orderId: ticket.orderId,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    category: extractCategory(rawCategory),
    isArchived: archived,
    assignedTo: ticket.assignedTo,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt: ticket.lastMessageAt,
    requester: user
      ? {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
        }
      : null,
    assignedAdmin: assignedAdmin
      ? {
          id: assignedAdmin.id,
          name: assignedAdmin.name,
          phone: assignedAdmin.phone,
          role: assignedAdmin.role,
        }
      : null,
    messages,
  };
}

function mapCategoryForResponse(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: Boolean(row.isActive),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveActiveCategoryName(category: unknown) {
  const raw = String(category || "").trim();
  if (!raw) return null;

  const row = await SupportTicketCategory.findOne({
    where: { name: raw, isActive: true },
  });
  return row ? String(row.get("name")) : null;
}

export async function listSupportTickets(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    const isAdmin = isPrivileged(auth.role);
    const { status, priority, category, userId, orderId, dateFrom, dateTo, search } = req.query as Record<
      string,
      string | undefined
    >;
    const whereClause: any = {};

    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;
    if (category) whereClause.category = category;
    if (userId && isAdmin) whereClause.userId = userId;
    if (orderId) whereClause.orderId = orderId;
    if (!isAdmin) whereClause.userId = auth.id;
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const userWhere: any = {};
    if (search && isAdmin) {
      userWhere[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const rows = await SupportTicket.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "phone", "role"],
          where: Object.keys(userWhere).length ? userWhere : undefined,
          required: Boolean(Object.keys(userWhere).length),
        },
        {
          model: User,
          as: "assignedAdmin",
          attributes: ["id", "name", "phone", "role"],
          required: false,
        },
        {
          model: SupportTicketMessage,
          as: "messages",
          separate: true,
          limit: 1,
          order: [["createdAt", "DESC"]],
          attributes: ["id", "ticketId", "senderId", "senderRole", "message", "createdAt"],
          include: [{ model: User, as: "sender", attributes: ["id", "name", "phone", "role"], required: false }],
        },
      ],
      order: [
        ["lastMessageAt", "DESC"],
        ["createdAt", "DESC"],
      ],
    });
    const mapped = rows.map((row) => mapTicketForResponse(row));
    const data = isAdmin ? mapped : mapped.filter((row) => !row.isArchived);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list support tickets" });
  }
}

export async function getSupportTicket(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    const row = await SupportTicket.findByPk(req.params.id, {
      include: [
        { model: User, as: "user", attributes: ["id", "name", "phone", "role"], required: false },
        { model: User, as: "assignedAdmin", attributes: ["id", "name", "phone", "role"], required: false },
        {
          model: SupportTicketMessage,
          as: "messages",
          attributes: ["id", "ticketId", "senderId", "senderRole", "message", "createdAt"],
          include: [{ model: User, as: "sender", attributes: ["id", "name", "phone", "role"], required: false }],
          order: [["createdAt", "ASC"]],
        },
      ],
    });
    if (!row) return res.status(404).json({ success: false, message: "Support ticket not found" });
    if (!isPrivileged(auth.role) && row.get("userId") !== auth.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (!isPrivileged(auth.role) && isArchivedCategory(row.get("category"))) {
      return res.status(404).json({ success: false, message: "Support ticket not found" });
    }
    return res.status(200).json({ success: true, data: mapTicketForResponse(row) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load support ticket" });
  }
}

export async function createSupportTicket(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    const { orderId, priority, category, subject, message } = req.body || {};
    const initialMessage = String(message || "").trim();
    if (!initialMessage) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }
    const normalizedCategory = await resolveActiveCategoryName(category);
    if (category !== undefined && String(category || "").trim() && !normalizedCategory) {
      return res.status(400).json({ success: false, message: "Categorie de ticket invalide." });
    }

    const row = await SupportTicket.create({
      userId: auth.id,
      orderId: orderId || null,
      priority: priority || "MEDIUM",
      category: normalizedCategory,
      subject: subject || null,
      status: "OPEN",
      lastMessageAt: new Date(),
    });

    await SupportTicketMessage.create({
      ticketId: String(row.get("id")),
      senderId: auth.id,
      senderRole: auth.role,
      message: initialMessage,
    });

    const hydrated = await SupportTicket.findByPk(String(row.get("id")), {
      include: [
        { model: User, as: "user", attributes: ["id", "name", "phone", "role"], required: false },
        {
          model: SupportTicketMessage,
          as: "messages",
          attributes: ["id", "ticketId", "senderId", "senderRole", "message", "createdAt"],
          include: [{ model: User, as: "sender", attributes: ["id", "name", "phone", "role"], required: false }],
          order: [["createdAt", "ASC"]],
        },
      ],
    });
    return res.status(201).json({ success: true, data: hydrated ? mapTicketForResponse(hydrated) : null });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create support ticket" });
  }
}

export async function updateSupportTicket(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    if (!isPrivileged(auth.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
    }
    const { status, priority, category, assignedTo } = req.body || {};
    const row = await SupportTicket.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Support ticket not found" });

    if (status) row.set("status", status);
    if (priority) row.set("priority", priority);
    if (category !== undefined) {
      if (category === null || String(category).trim() === "") {
        row.set("category", null);
      } else {
        const normalizedCategory = await resolveActiveCategoryName(category);
        if (!normalizedCategory) {
          return res.status(400).json({ success: false, message: "Categorie de ticket invalide." });
        }
        row.set("category", normalizedCategory);
      }
    }
    if (assignedTo !== undefined) row.set("assignedTo", assignedTo);

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update support ticket" });
  }
}

export async function listSupportTicketCategories(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    const includeInactive = isPrivileged(auth.role) && String(req.query.includeInactive || "") === "true";
    const rows = await SupportTicketCategory.findAll({
      where: includeInactive ? undefined : { isActive: true },
      order: [["sortOrder", "ASC"], ["name", "ASC"]],
    });
    return res.status(200).json({ success: true, data: rows.map((row) => mapCategoryForResponse(row)) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list support ticket categories" });
  }
}

export async function createSupportTicketCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    if (!isPrivileged(auth.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
    }

    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const sortOrder = Number(req.body?.sortOrder ?? 0);
    if (!name) {
      return res.status(400).json({ success: false, message: "Le nom de la categorie est requis." });
    }

    const existing = await SupportTicketCategory.findOne({ where: { name } });
    if (existing) {
      return res.status(409).json({ success: false, message: "Cette categorie existe deja." });
    }

    const row = await SupportTicketCategory.create({
      name,
      description: description || null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive: true,
    });
    return res.status(201).json({ success: true, data: mapCategoryForResponse(row) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create support ticket category" });
  }
}

export async function updateSupportTicketCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    if (!isPrivileged(auth.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
    }

    const row = await SupportTicketCategory.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Categorie introuvable." });
    }

    const name = req.body?.name !== undefined ? String(req.body?.name || "").trim() : null;
    const description = req.body?.description !== undefined ? String(req.body?.description || "").trim() : null;
    const sortOrder = req.body?.sortOrder !== undefined ? Number(req.body?.sortOrder) : null;
    const isActive = req.body?.isActive;

    if (name !== null) {
      if (!name) {
        return res.status(400).json({ success: false, message: "Le nom de la categorie est requis." });
      }
      const duplicate = await SupportTicketCategory.findOne({
        where: { name, id: { [Op.ne]: req.params.id } },
      });
      if (duplicate) {
        return res.status(409).json({ success: false, message: "Cette categorie existe deja." });
      }
      row.set("name", name);
    }

    if (description !== null) row.set("description", description || null);
    if (sortOrder !== null && Number.isFinite(sortOrder)) row.set("sortOrder", sortOrder);
    if (typeof isActive === "boolean") row.set("isActive", isActive);

    await row.save();
    return res.status(200).json({ success: true, data: mapCategoryForResponse(row) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update support ticket category" });
  }
}

export async function deleteSupportTicketCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    if (!isPrivileged(auth.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
    }

    const row = await SupportTicketCategory.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Categorie introuvable." });
    }

    row.set("isActive", false);
    await row.save();
    return res.status(200).json({ success: true, message: "Categorie supprimee." });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete support ticket category" });
  }
}

export async function deleteSupportTicket(req: AuthenticatedRequest, res: Response) {
  const auth = ensureAuth(req, res);
  if (!auth) return;
  try {
    const row = await SupportTicket.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Support ticket not found" });

    const isAdmin = isPrivileged(auth.role);
    if (!isAdmin && row.get("userId") !== auth.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (isArchivedCategory(row.get("category"))) {
      return res.status(200).json({ success: true, message: "Support ticket archived" });
    }

    row.set("status", "CLOSED");
    row.set("category", archivedCategoryValue(row.get("category")));
    row.set("lastMessageAt", new Date());
    await row.save();

    await SupportTicketMessage.create({
      ticketId: String(row.get("id")),
      senderId: auth.id,
      senderRole: auth.role,
      message: isAdmin ? "Ticket archive par le support." : "Ticket archive par l'utilisateur.",
    });

    return res.status(200).json({ success: true, message: "Support ticket archived" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete support ticket" });
  }
}

export async function postSupportTicketMessage(req: AuthenticatedRequest, res: Response) {
  try {
    const auth = ensureAuth(req, res);
    if (!auth) return;

    const ticketId = req.params.id;
    const messageText = String(req.body?.message || "").trim();
    if (!messageText) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    const ticket = await SupportTicket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found" });
    }

    const isAdmin = isPrivileged(auth.role);
    if (!isAdmin && ticket.get("userId") !== auth.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (isArchivedCategory(ticket.get("category")) && !isAdmin) {
      return res.status(400).json({ success: false, message: "Ticket archived" });
    }

    const row = await SupportTicketMessage.create({
      ticketId,
      senderId: auth.id,
      senderRole: auth.role,
      message: messageText,
    });

    ticket.set("lastMessageAt", new Date());
    if (!isAdmin && ["RESOLVED", "CLOSED"].includes(String(ticket.get("status")))) {
      ticket.set("status", "OPEN");
    }
    if (isAdmin && String(ticket.get("status")) === "OPEN") {
      ticket.set("status", "PENDING");
    }
    await ticket.save();

    const requester = await User.findByPk(String(ticket.get("userId")), { attributes: ["id", "fcmToken"], raw: true });
    const sender = await User.findByPk(auth.id, { attributes: ["id", "name", "phone", "role"], raw: true });

    if (requester && isAdmin) {
      const token = String((requester as any).fcmToken || "").trim();
      if (token && token !== "undefined" && token !== "null") {
        await sendPushNotification(
          token,
          "Support PassKey",
          messageText,
          {
            type: "SUPPORT_REPLY",
            ticketId,
            senderName: String((sender as any)?.name || "Support"),
            senderRole: String((sender as any)?.role || "admin"),
            title: "Support PassKey",
            message: messageText,
            createdAt: new Date().toISOString(),
          },
          {
            room: `user_${String(ticket.get("userId") || "").trim()}`,
            event: "support:reply",
            payload: {
              type: "SUPPORT_REPLY",
              ticketId,
              senderName: String((sender as any)?.name || "Support"),
              senderRole: String((sender as any)?.role || "admin"),
              title: "Support PassKey",
              message: messageText,
            },
          }
        );
      }
    }

    const created = await SupportTicketMessage.findByPk(String(row.get("id")), {
      include: [{ model: User, as: "sender", attributes: ["id", "name", "phone", "role"], required: false }],
    });

    return res.status(201).json({
      success: true,
      data: {
        id: created?.get("id"),
        ticketId: created?.get("ticketId"),
        senderId: created?.get("senderId"),
        senderRole: created?.get("senderRole"),
        message: created?.get("message"),
        createdAt: created?.get("createdAt"),
        sender: (created as any)?.sender
          ? {
              id: (created as any).sender.id,
              name: (created as any).sender.name,
              phone: (created as any).sender.phone,
              role: (created as any).sender.role,
            }
          : null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to send support message" });
  }
}

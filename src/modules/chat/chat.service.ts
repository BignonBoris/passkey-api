import { Op } from "sequelize";
import ChatConversation from "../../models/chat-conversation.model";
import ChatMessage from "../../models/chat-message.model";
import User from "../../models/user.model";
import Order from "../../models/order.model";

function normalizeRole(role: string | undefined | null): string {
  return (role || "").trim().toLowerCase();
}

function isDriverRole(role: string | undefined | null): boolean {
  const normalized = normalizeRole(role);
  return normalized === "livreur" || normalized === "driver";
}

function isUsagerRole(role: string | undefined | null): boolean {
  return normalizeRole(role) === "usager";
}

function resolvePairByRoles(
  first: { id: string; role: string },
  second: { id: string; role: string }
): { userId: string; driverId: string } | null {
  if (isUsagerRole(first.role) && isDriverRole(second.role)) {
    return { userId: first.id, driverId: second.id };
  }
  if (isDriverRole(first.role) && isUsagerRole(second.role)) {
    return { userId: second.id, driverId: first.id };
  }
  return null;
}

export async function loadUserOrThrow(userId: string) {
  const user = await User.findByPk(userId, {
    attributes: ["id", "name", "phone", "role", "avatarUrl", "isAvailable"],
  });
  if (!user) {
    throw new Error("Utilisateur introuvable");
  }
  return user;
}

export async function getOrCreateConversationForParticipants(params: {
  currentUserId: string;
  otherUserId: string;
  orderId?: string | null;
}) {
  const { currentUserId, otherUserId, orderId } = params;
  const currentUser = await loadUserOrThrow(currentUserId);
  const otherUser = await loadUserOrThrow(otherUserId);

  const pair = resolvePairByRoles(
    {
      id: String(currentUser.get("id")),
      role: String(currentUser.get("role")),
    },
    {
      id: String(otherUser.get("id")),
      role: String(otherUser.get("role")),
    }
  );

  if (!pair) {
    throw new Error("Le chat est autorisé uniquement entre un usager et un livreur.");
  }

  if (orderId) {
    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new Error("Course introuvable");
    }
  }

  const [conversation] = await ChatConversation.findOrCreate({
    where: {
      userId: pair.userId,
      driverId: pair.driverId,
    },
    defaults: {
      userId: pair.userId,
      driverId: pair.driverId,
      orderId: orderId || null,
      lastMessage: null,
      lastMessageAt: null,
    },
  });

  if (!conversation.get("orderId") && orderId) {
    conversation.set("orderId", orderId);
    await conversation.save();
  }

  return conversation;
}

export async function canUserAccessConversation(conversationId: string, userId: string) {
  const conversation = await ChatConversation.findOne({
    where: {
      id: conversationId,
      [Op.or]: [{ userId }, { driverId: userId }],
    },
  });
  return conversation;
}

export async function createChatMessage(params: {
  senderId: string;
  recipientId: string;
  content: string;
  conversationId?: string | null;
  orderId?: string | null;
}) {
  const { senderId, recipientId, content, conversationId, orderId } = params;

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error("Le contenu du message est obligatoire.");
  }

  let conversation: ChatConversation | null = null;
  if (conversationId) {
    conversation = await canUserAccessConversation(conversationId, senderId);
    if (!conversation) {
      throw new Error("Conversation introuvable ou accès refusé.");
    }
  } else {
    conversation = await getOrCreateConversationForParticipants({
      currentUserId: senderId,
      otherUserId: recipientId,
      orderId,
    });
  }

  const message = await ChatMessage.create({
    conversationId: String(conversation.get("id")),
    senderId,
    recipientId,
    content: trimmedContent,
  });

  conversation.set("lastMessage", trimmedContent);
  conversation.set("lastMessageAt", new Date());
  await conversation.save();

  return { conversation, message };
}

export async function listConversationsForUser(userId: string, limit: number = 20, offset: number = 0) {
  const conversations = await ChatConversation.findAll({
    where: {
      [Op.or]: [{ userId }, { driverId: userId }],
    },
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "phone", "role", "avatarUrl", "isAvailable"],
      },
      {
        model: User,
        as: "driver",
        attributes: ["id", "name", "phone", "role", "avatarUrl", "isAvailable"],
      },
    ],
    order: [["lastMessageAt", "DESC"], ["updatedAt", "DESC"]],
    limit: Math.min(Math.max(limit, 1), 100),
    offset: Math.max(offset, 0),
  });

  const serialized = await Promise.all(
    conversations.map(async (conversation) => {
      const convId = String(conversation.get("id"));
      const user = conversation.get("user") as User;
      const driver = conversation.get("driver") as User;
      const isCurrentUserDriver = String(driver?.get("id")) === userId;
      const other = isCurrentUserDriver ? user : driver;

      const unreadCount = await ChatMessage.count({
        where: {
          conversationId: convId,
          recipientId: userId,
          isRead: false,
        },
      });

      return {
        id: convId,
        orderId: conversation.get("orderId"),
        lastMessage: conversation.get("lastMessage"),
        lastMessageAt: conversation.get("lastMessageAt") || conversation.get("updatedAt"),
        unreadCount,
        otherParticipant: {
          id: String(other.get("id")),
          name: other.get("name"),
          phone: other.get("phone"),
          role: other.get("role"),
          avatarUrl: other.get("avatarUrl"),
          isAvailable: other.get("isAvailable"),
        },
      };
    })
  );

  return serialized;
}

export async function listMessagesForConversation(params: {
  conversationId: string;
  userId: string;
  limit?: number;
  offset?: number;
}) {
  const { conversationId, userId, limit = 50, offset = 0 } = params;
  const conversation = await canUserAccessConversation(conversationId, userId);
  if (!conversation) {
    throw new Error("Conversation introuvable ou accès refusé.");
  }

  const rows = await ChatMessage.findAll({
    where: { conversationId },
    include: [
      {
        model: User,
        as: "sender",
        attributes: ["id", "name", "phone", "role", "avatarUrl"],
      },
    ],
    order: [["createdAt", "ASC"]],
    limit: Math.min(Math.max(limit, 1), 100),
    offset: Math.max(offset, 0),
  });

  return rows.map((row) => ({
    id: String(row.get("id")),
    conversationId: String(row.get("conversationId")),
    senderId: String(row.get("senderId")),
    recipientId: String(row.get("recipientId")),
    content: String(row.get("content")),
    isRead: Boolean(row.get("isRead")),
    readAt: row.get("readAt"),
    createdAt: row.get("createdAt"),
    sender: row.get("sender"),
  }));
}

export async function markConversationAsRead(conversationId: string, userId: string) {
  const conversation = await canUserAccessConversation(conversationId, userId);
  if (!conversation) {
    throw new Error("Conversation introuvable ou accès refusé.");
  }

  await ChatMessage.update(
    {
      isRead: true,
      readAt: new Date(),
    },
    {
      where: {
        conversationId,
        recipientId: userId,
        isRead: false,
      },
    }
  );
}

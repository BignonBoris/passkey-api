import { Response } from "express";
import { Server } from "socket.io";
import { AuthenticatedRequest } from "../../types/auth-request";
import User from "../../models/user.model";
import { sendPushNotification } from "../../services/notification.service";
import {
  createChatMessage,
  getOrCreateConversationForParticipants,
  listConversationsForUser,
  listMessagesForConversation,
  markConversationAsRead,
} from "./chat.service";

function getIo(req: AuthenticatedRequest): Server | null {
  return ((req as any).io as Server | undefined) || null;
}

function ensureUser(req: AuthenticatedRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Non authentifie" });
    return null;
  }
  return userId;
}

function getRoomSockets(io: Server, roomName: string): Set<string> {
  return new Set(io.sockets.adapter.rooms.get(roomName) || []);
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

export async function getConversations(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;

    const conversations = await listConversationsForUser(userId);
    return res.status(200).json({ success: true, data: conversations });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load conversations",
    });
  }
}

export async function getConversationMessages(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;

    const conversationId = req.params.conversationId;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const messages = await listMessagesForConversation({
      conversationId,
      userId,
      limit,
      offset,
    });

    await markConversationAsRead(conversationId, userId);

    return res.status(200).json({ success: true, data: messages });
  } catch (error: any) {
    const status = error?.message?.includes("access denied") ? 403 : 400;
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to load messages",
    });
  }
}

export async function openConversationWithUser(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;

    const otherUserId = req.params.otherUserId;
    const orderId = (req.query.orderId as string | undefined) || null;
    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: "otherUserId is required",
      });
    }

    const conversation = await getOrCreateConversationForParticipants({
      currentUserId: userId,
      otherUserId,
      orderId,
    });
    return res.status(200).json({ success: true, data: conversation });
  } catch (error: any) {
    const status = error?.message?.includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to open conversation",
    });
  }
}

export async function sendMessage(req: AuthenticatedRequest, res: Response) {
  try {
    const senderId = ensureUser(req, res);
    if (!senderId) return;

    const { recipientId, conversationId, orderId, content } = req.body || {};
    if (!recipientId || !content) {
      return res.status(400).json({
        success: false,
        message: "recipientId and content are required",
      });
    }

    const { conversation, message } = await createChatMessage({
      senderId,
      recipientId: String(recipientId),
      conversationId: conversationId ? String(conversationId) : null,
      orderId: orderId ? String(orderId) : null,
      content: String(content),
    });

    const payload = {
      id: String(message.get("id")),
      conversationId: String(conversation.get("id")),
      senderId: String(message.get("senderId")),
      recipientId: String(message.get("recipientId")),
      content: String(message.get("content")),
      isRead: Boolean(message.get("isRead")),
      readAt: message.get("readAt"),
      createdAt: message.get("createdAt"),
    };

    const sender = await User.findByPk(senderId, {
      attributes: ["id", "name"],
      raw: true,
    });
    const recipient = await User.findByPk(String(recipientId), {
      attributes: ["id", "fcmToken"],
      raw: true,
    });

    const senderName = (sender as any)?.name?.toString()?.trim() || "Nouveau message";
    const chatRoute = `/chat/${payload.conversationId}?name=${encodeURIComponent(senderName)}&peerId=${encodeURIComponent(payload.senderId)}`;
    const notificationPayload = {
      type: "CHAT_MESSAGE",
      conversationId: payload.conversationId,
      peerId: payload.senderId,
      peerName: senderName,
      messagePreview: payload.content,
      route: chatRoute,
      createdAt: new Date().toISOString(),
    };

    const io = getIo(req);
    if (io) {
      io.to(`user_${senderId}`).emit("chat:new_message", payload);
      io.to(`user_${recipientId}`).emit("chat:new_message", payload);
      io.to(`chat_${conversation.get("id")}`).emit("chat:new_message", payload);

      const recipientUserSockets = getRoomSockets(io, `user_${recipientId}`);
      const conversationSockets = getRoomSockets(io, `chat_${conversation.get("id")}`);
      const recipientInsideConversation = intersects(recipientUserSockets, conversationSockets);

      if (!recipientInsideConversation) {
        io.to(`user_${recipientId}`).emit("chat:incoming_notification", notificationPayload);
      }

      const recipientToken = ((recipient as any)?.fcmToken ?? "").toString().trim();
      if (!recipientInsideConversation && recipientToken && recipientToken !== "undefined" && recipientToken !== "null") {
        await sendPushNotification(
          recipientToken,
          senderName,
          payload.content,
          {
            type: "CHAT_MESSAGE",
            conversationId: payload.conversationId,
            peerId: payload.senderId,
            peerName: senderName,
            route: chatRoute,
          }
        );
      }
    }

    return res.status(201).json({ success: true, data: payload });
  } catch (error: any) {
    const status = error?.message?.includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to send message",
    });
  }
}

export async function readConversation(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;

    const conversationId = req.params.conversationId;
    await markConversationAsRead(conversationId, userId);

    const io = getIo(req);
    if (io) {
      io.to(`chat_${conversationId}`).emit("chat:read", {
        conversationId,
        userId,
        readAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    const status = error?.message?.includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to mark conversation as read",
    });
  }
}

import express from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import {
  getConversationMessages,
  getConversations,
  openConversationWithUser,
  readConversation,
  sendMessage,
} from "./chat.controller";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Messagerie instantanée entre usagers et livreurs
 */

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     summary: Liste de mes conversations
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des conversations
 */
router.get("/conversations", getConversations);

/**
 * @swagger
 * /chat/conversations/{conversationId}/messages:
 *   get:
 *     summary: Liste des messages d'une conversation
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: number, default: 0 }
 *     responses:
 *       200:
 *         description: Liste des messages
 */
router.get("/conversations/:conversationId/messages", getConversationMessages);

/**
 * @swagger
 * /chat/conversations/{conversationId}/read:
 *   patch:
 *     summary: Marquer une conversation comme lue
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Succès
 */
router.patch("/conversations/:conversationId/read", readConversation);

/**
 * @swagger
 * /chat/conversations/with/{otherUserId}:
 *   get:
 *     summary: Ouvrir ou créer une conversation avec un autre utilisateur
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: otherUserId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: orderId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Conversation retournée
 */
router.get("/conversations/with/:otherUserId", openConversationWithUser);

/**
 * @swagger
 * /chat/messages:
 *   post:
 *     summary: Envoyer un message
 *     tags: [Chat]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientId, content]
 *             properties:
 *               recipientId: { type: string }
 *               conversationId: { type: string }
 *               orderId: { type: string }
 *               content: { type: string }
 *     responses:
 *       201:
 *         description: Message envoyé
 */
router.post("/messages", sendMessage);

export default router;

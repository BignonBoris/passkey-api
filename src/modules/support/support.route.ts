import express from "express";
import {
  listSupportTickets,
  getSupportTicket,
  createSupportTicket,
  updateSupportTicket,
  deleteSupportTicket,
  postSupportTicketMessage,
  listSupportTicketCategories,
  createSupportTicketCategory,
  updateSupportTicketCategory,
  deleteSupportTicketCategory,
} from "./support.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Support
 *   description: Gestion des tickets de support et messagerie
 */

/**
 * @swagger
 * /support/tickets:
 *   get:
 *     summary: "Liste des tickets de support (Admin: tous, User: les siens)"
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, PENDING, RESOLVED, CLOSED] }
 *     responses:
 *       200:
 *         description: Liste des tickets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: "#/components/schemas/SupportTicket" } }
 *   post:
 *     summary: Créer un nouveau ticket de support
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               subject: { type: string }
 *               category: { type: string }
 *               priority: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *               message: { type: string }
 *               orderId: { type: string }
 *     responses:
 *       201:
 *         description: Ticket créé
 */
router.get("/tickets", authenticate, listSupportTickets);
router.post("/tickets", authenticate, createSupportTicket);

/**
 * @swagger
 * /support/categories:
 *   get:
 *     summary: Liste des catégories de tickets disponibles
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des catégories
 *   post:
 *     summary: Créer une catégorie de ticket (Admin only)
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Catégorie créée
 */
router.get("/categories", authenticate, listSupportTicketCategories);
router.post("/categories", authenticate, authorize(PRIVILEGED_ROLES), createSupportTicketCategory);

/**
 * @swagger
 * /support/categories/{id}:
 *   patch:
 *     summary: Modifier une catégorie (Admin only)
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Succès
 *   delete:
 *     summary: Désactiver une catégorie (Admin only)
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Succès
 */
router.patch("/categories/:id", authenticate, authorize(PRIVILEGED_ROLES), updateSupportTicketCategory);
router.delete("/categories/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteSupportTicketCategory);

/**
 * @swagger
 * /support/tickets/{id}:
 *   get:
 *     summary: Détails d'un ticket avec ses messages
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Détails du ticket
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/SupportTicket" }
 *   patch:
 *     summary: Mettre à jour un ticket (Admin only)
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Succès
 *   delete:
 *     summary: Archiver/Fermer un ticket
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Ticket archivé
 */
router.get("/tickets/:id", authenticate, getSupportTicket);
router.patch("/tickets/:id", authenticate, authorize(PRIVILEGED_ROLES), updateSupportTicket);
router.delete("/tickets/:id", authenticate, deleteSupportTicket);

/**
 * @swagger
 * /support/tickets/{id}/messages:
 *   post:
 *     summary: Envoyer un message dans un ticket
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string }
 *     responses:
 *       201:
 *         description: Message envoyé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/SupportMessage" }
 */
router.post("/tickets/:id/messages", authenticate, postSupportTicketMessage);

export default router;

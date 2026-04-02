import express from "express";
import {
  listRefunds,
  getRefund,
  createRefund,
  updateRefund,
  deleteRefund,
} from "./refunds.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Refunds
 *   description: Gestion des remboursements (Admin only)
 */

/**
 * @swagger
 * /refunds:
 *   get:
 *     summary: Liste des demandes de remboursement (Admin only)
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED, PAID] }
 *     responses:
 *       200:
 *         description: Liste des remboursements
 *   post:
 *     summary: Créer une demande de remboursement (Admin only)
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentId, orderId, userId, amount]
 *             properties:
 *               paymentId: { type: string }
 *               orderId: { type: string }
 *               userId: { type: string }
 *               amount: { type: number }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Demande créée
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listRefunds);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createRefund);

/**
 * @swagger
 * /refunds/{id}:
 *   get:
 *     summary: Détails d'un remboursement
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails du remboursement
 *   patch:
 *     summary: Mettre à jour un remboursement
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [PENDING, APPROVED, REJECTED, PAID] }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Remboursement mis à jour
 *   delete:
 *     summary: Supprimer un remboursement
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Succès
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getRefund);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateRefund);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteRefund);

export default router;

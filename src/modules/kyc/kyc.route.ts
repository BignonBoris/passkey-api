import express from "express";
import {
  listKycRequests,
  getKycRequest,
  createKycRequest,
  updateKycRequest,
  deleteKycRequest,
} from "./kyc.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: KYC
 *   description: Gestion des demandes de vérification d'identité (KYC/KYB) (Admin only)
 */

/**
 * @swagger
 * /kyc:
 *   get:
 *     summary: Liste des demandes KYC/KYB (Admin only)
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED, REVIEW] }
 *     responses:
 *       200:
 *         description: Liste des demandes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 count: { type: integer }
 *                 data:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/KycRequest" }
 *   post:
 *     summary: Créer une demande KYC/KYB (Admin only)
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, type]
 *             properties:
 *               userId: { type: string }
 *               type: { type: string, enum: [KYC, KYB] }
 *               status: { type: string, enum: [PENDING, APPROVED, REJECTED, REVIEW] }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Demande créée
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/KycRequest" }
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listKycRequests);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createKycRequest);

/**
 * @swagger
 * /kyc/{id}:
 *   get:
 *     summary: Détails d'une demande KYC/KYB
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails de la demande
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/KycRequest" }
 *   patch:
 *     summary: Mettre à jour une demande KYC/KYB
 *     tags: [KYC]
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
 *               status: { type: string, enum: [PENDING, APPROVED, REJECTED, REVIEW] }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Demande mise à jour
 *   delete:
 *     summary: Supprimer une demande KYC/KYB
 *     tags: [KYC]
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
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getKycRequest);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateKycRequest);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteKycRequest);

export default router;

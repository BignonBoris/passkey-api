import express from "express";
import {
  listPromotions,
  getPromotion,
  createPromotion,
  updatePromotion,
  deletePromotion,
  listPromotionRedemptions,
  createPromotionRedemption,
} from "./promotions.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Promotions
 *   description: Gestion des promotions et codes promos (Admin only)
 */

/**
 * @swagger
 * /promotions/redemptions/list:
 *   get:
 *     summary: Liste des utilisations de codes promos (Admin only)
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: promotionId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des utilisations
 */
router.get("/redemptions/list", authenticate, authorize(PRIVILEGED_ROLES), listPromotionRedemptions);

/**
 * @swagger
 * /promotions/redemptions:
 *   post:
 *     summary: Utiliser un code promo (Admin only - Normally automated)
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [promotionId, userId]
 *             properties:
 *               promotionId: { type: string }
 *               userId: { type: string }
 *               orderId: { type: string }
 *               amount: { type: number }
 *     responses:
 *       201:
 *         description: Utilisation enregistrée
 */
router.post("/redemptions", authenticate, authorize(PRIVILEGED_ROLES), createPromotionRedemption);

/**
 * @swagger
 * /promotions:
 *   get:
 *     summary: Liste des promotions (Admin only)
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des promotions
 *   post:
 *     summary: Créer une promotion (Admin only)
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, discountType, discountValue]
 *             properties:
 *               code: { type: string, example: "WELCOME30" }
 *               discountType: { type: string, enum: [PERCENTAGE, FIXED] }
 *               discountValue: { type: number }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *               validFrom: { type: string, format: date-time }
 *               validTo: { type: string, format: date-time }
 *               usageLimit: { type: number }
 *     responses:
 *       201:
 *         description: Promotion créée
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listPromotions);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createPromotion);

/**
 * @swagger
 * /promotions/{id}:
 *   get:
 *     summary: Détails d'une promotion
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails de la promotion
 *   patch:
 *     summary: Modifier une promotion
 *     tags: [Promotions]
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
 *   delete:
 *     summary: Supprimer une promotion
 *     tags: [Promotions]
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
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getPromotion);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updatePromotion);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deletePromotion);

export default router;

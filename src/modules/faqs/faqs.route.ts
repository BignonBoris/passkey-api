import express from "express";
import { createFaq, deleteFaq, listFaqs, listPublicFaqs, updateFaq } from "./faqs.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: FAQs
 *   description: Foire aux questions
 */

/**
 * @swagger
 * /faqs/public:
 *   get:
 *     summary: Liste des FAQs publiques (Pour tous)
 *     tags: [FAQs]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des FAQs
 */
router.get("/public", authenticate, listPublicFaqs);

/**
 * @swagger
 * /faqs:
 *   get:
 *     summary: Liste complète des FAQs (Admin only)
 *     tags: [FAQs]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des FAQs
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listFaqs);

/**
 * @swagger
 * /faqs:
 *   post:
 *     summary: Créer une nouvelle FAQ (Admin only)
 *     tags: [FAQs]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question, answer]
 *             properties:
 *               question: { type: string }
 *               answer: { type: string }
 *               category: { type: string }
 *               isActive: { type: boolean }
 *               order: { type: number }
 *     responses:
 *       201:
 *         description: FAQ créée
 */
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createFaq);

/**
 * @swagger
 * /faqs/{id}:
 *   patch:
 *     summary: Mettre à jour une FAQ (Admin only)
 *     tags: [FAQs]
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
 *               question: { type: string }
 *               answer: { type: string }
 *               category: { type: string }
 *               isActive: { type: boolean }
 *               order: { type: number }
 *     responses:
 *       200:
 *         description: FAQ mise à jour
 */
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateFaq);

/**
 * @swagger
 * /faqs/{id}:
 *   delete:
 *     summary: Supprimer une FAQ (Admin only)
 *     tags: [FAQs]
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
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteFaq);

export default router;

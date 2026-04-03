import express from "express";
import { getSettings, updateSettings } from "./settings.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: Paramètres globaux de l'application (Contact, About, Operations) (Admin only)
 */

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Récupérer tous les paramètres globaux (Admin only)
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Paramètres récupérés
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/GlobalSettings" }
 *   put:
 *     summary: Mettre à jour les paramètres globaux (Admin only)
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/GlobalSettings" }
 *     responses:
 *       200:
 *         description: Paramètres mis à jour
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), getSettings);
router.put("/", authenticate, authorize(PRIVILEGED_ROLES), updateSettings);

export default router;

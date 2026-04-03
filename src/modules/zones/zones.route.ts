import express from "express";
import {
  listZones,
  getZone,
  createZone,
  updateZone,
  deleteZone,
} from "./zones.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Zones
 *   description: Gestion des zones de service géographiques (Admin only)
 */

/**
 * @swagger
 * /zones:
 *   get:
 *     summary: Liste des zones de service
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *       - in: query
 *         name: countryId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des zones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: "#/components/schemas/ServiceZone" } }
 *   post:
 *     summary: Créer une nouvelle zone de service
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               countryId: { type: string, description: "Optionnel, Bénin par defaut" }
 *               city: { type: string }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *               polygon: { type: object, description: "GeoJSON or custom polygon object" }
 *     responses:
 *       201:
 *         description: Zone créée
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listZones);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createZone);

/**
 * @swagger
 * /zones/{id}:
 *   get:
 *     summary: Détails d'une zone
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails de la zone
 *   patch:
 *     summary: Modifier une zone
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Mis à jour
 *   delete:
 *     summary: Supprimer une zone
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Supprimé
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getZone);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateZone);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteZone);

export default router;

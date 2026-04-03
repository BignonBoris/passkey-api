import express from "express";
import {
  listIncidents,
  getIncident,
  createIncident,
  updateIncident,
  deleteIncident,
} from "./incidents.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Incidents
 *   description: Gestion des incidents opérationnels (Admin only)
 */

/**
 * @swagger
 * /incidents:
 *   get:
 *     summary: Liste des incidents (Admin only)
 *     tags: [Incidents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED] }
 *     responses:
 *       200:
 *         description: Liste des incidents
 *   post:
 *     summary: Déclarer un nouvel incident (Admin only)
 *     tags: [Incidents]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, priority]
 *             properties:
 *               orderId: { type: string }
 *               driverId: { type: string }
 *               type: { type: string, example: "ACCIDENT" }
 *               priority: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Incident créé
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listIncidents);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createIncident);

/**
 * @swagger
 * /incidents/{id}:
 *   get:
 *     summary: Détails d'un incident
 *     tags: [Incidents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails de l'incident
 *   patch:
 *     summary: Mettre à jour un incident
 *     tags: [Incidents]
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
 *               status: { type: string, enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED] }
 *               priority: { type: string, enum: [LOW, MEDIUM, HIGH, CRITICAL] }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Incident mis à jour
 *   delete:
 *     summary: Supprimer un incident
 *     tags: [Incidents]
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
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getIncident);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateIncident);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteIncident);

export default router;

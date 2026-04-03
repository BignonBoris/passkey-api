import express from "express";
import {
  listRevenueConfigs,
  getRevenueConfig,
  createOrUpdateRevenueConfig,
  updateRevenueConfig,
  deleteRevenueConfig,
  calculateRevenue,
} from "./revenue.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Revenue
 *   description: Gestion des revenus des chauffeurs et commissions (Admin only)
 */

/**
 * @swagger
 * /revenue/configs:
 *   get:
 *     summary: Liste des configurations de revenus par type de véhicule
 *     tags: [Revenue]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: vehicleType
 *         schema: { type: string }
 *       - in: query
 *         name: countryId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des configurations
 *   post:
 *     summary: Créer ou mettre à jour une configuration de revenus
 *     tags: [Revenue]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleType]
 *             properties:
 *               id: { type: string }
 *               countryId: { type: string, description: "Optionnel, Bénin par defaut" }
 *               vehicleType: { type: string }
 *               baseFare: { type: number }
 *               perKmRate: { type: number }
 *               perMinuteRate: { type: number }
 *               commissionPercent: { type: number }
 *               serviceFeePercent: { type: number }
 *     responses:
 *       201:
 *         description: Configuration enregistrée
 */
router.get("/configs", authenticate, authorize(PRIVILEGED_ROLES), listRevenueConfigs);

/**
 * @swagger
 * /revenue/configs/{id}:
 *   get:
 *     summary: Détails d'une configuration de revenus
 *     tags: [Revenue]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails de la config
 *   patch:
 *     summary: Modifier une configuration de revenus
 *     tags: [Revenue]
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
 *     summary: Supprimer une configuration de revenus
 *     tags: [Revenue]
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
router.get("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), getRevenueConfig);
router.post("/configs", authenticate, authorize(PRIVILEGED_ROLES), createOrUpdateRevenueConfig);
router.patch("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), updateRevenueConfig);
router.delete("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteRevenueConfig);

/**
 * @swagger
 * /revenue/calculate:
 *   post:
 *     summary: Simuler le calcul des revenus pour une course
 *     tags: [Revenue]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleType, distanceKm]
 *             properties:
 *               vehicleType: { type: string }
 *               countryId: { type: string }
 *               distanceKm: { type: number }
 *               durationMinutes: { type: number }
 *               tip: { type: number }
 *               extras: { type: number }
 *     responses:
 *       200:
 *         description: Résultat du calcul
 */
router.post("/calculate", authenticate, authorize(PRIVILEGED_ROLES), calculateRevenue);

export default router;

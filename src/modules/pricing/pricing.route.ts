import express from "express";
import {
  calculatePricing,
  createOrUpdatePricingConfig,
  deletePricingConfig,
  listPricingConfigs,
  listPricingRulesController,
  createPricingRuleController,
  updatePricingRuleController,
  deletePricingRuleController,
  updatePricingConfig,
} from "./pricing.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Pricing
 *   description: Gestion des tarifs et règles de prix (Admin only)
 */

/**
 * @swagger
 * /pricing/configs:
 *   get:
 *     summary: Liste des configurations tarifaires par type de véhicule
 *     tags: [Pricing]
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
 *     summary: Créer ou mettre à jour une configuration tarifaire
 *     tags: [Pricing]
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
 *               bookingFee: { type: number }
 *               minimumFare: { type: number }
 *     responses:
 *       201:
 *         description: Configuration créée/mise à jour
 */
router.get("/configs", authenticate, authorize(PRIVILEGED_ROLES), listPricingConfigs);
router.post("/configs", authenticate, authorize(PRIVILEGED_ROLES), createOrUpdatePricingConfig);

/**
 * @swagger
 * /pricing/configs/{id}:
 *   patch:
 *     summary: Modifier une configuration tarifaire
 *     tags: [Pricing]
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
 *     summary: Supprimer une configuration tarifaire
 *     tags: [Pricing]
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
router.patch("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), updatePricingConfig);
router.delete("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), deletePricingConfig);

/**
 * @swagger
 * /pricing/rules:
 *   get:
 *     summary: Liste des règles de prix (Surge, Discount, etc.)
 *     tags: [Pricing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [SURGE, DISCOUNT, FIXED] }
 *       - in: query
 *         name: countryId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des règles
 *   post:
 *     summary: Créer une nouvelle règle de prix
 *     tags: [Pricing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/PricingRule" }
 *     responses:
 *       201:
 *         description: Règle créée
 */
router.get("/rules", authenticate, authorize(PRIVILEGED_ROLES), listPricingRulesController);
router.post("/rules", authenticate, authorize(PRIVILEGED_ROLES), createPricingRuleController);

/**
 * @swagger
 * /pricing/rules/{id}:
 *   patch:
 *     summary: Modifier une règle de prix
 *     tags: [Pricing]
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
 *     summary: Supprimer une règle de prix
 *     tags: [Pricing]
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
router.patch("/rules/:id", authenticate, authorize(PRIVILEGED_ROLES), updatePricingRuleController);
router.delete("/rules/:id", authenticate, authorize(PRIVILEGED_ROLES), deletePricingRuleController);

/**
 * @swagger
 * /pricing/calculate:
 *   post:
 *     summary: Simuler le calcul d'un prix
 *     tags: [Pricing]
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
 *               extras: { type: number }
 *               pickupTimestamp: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Résultat du calcul
 */
router.post("/calculate", authenticate, authorize(PRIVILEGED_ROLES), calculatePricing);

export default router;

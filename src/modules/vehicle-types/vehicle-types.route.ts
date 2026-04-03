import express from "express";
import {
  activateVehicleType,
  createVehicleType,
  deactivateVehicleType,
  deleteVehicleType,
  listVehicleTypes,
  updateVehicleType,
} from "./vehicle-types.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: VehicleTypes
 *   description: Gestion des types de véhicules supportés (Moto, Voiture, etc.)
 */

/**
 * @swagger
 * /vehicle-types:
 *   get:
 *     summary: Liste des types de véhicules
 *     tags: [VehicleTypes]
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema: { type: boolean }
 *       - in: query
 *         name: countryId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des types de véhicules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: "#/components/schemas/VehicleType" } }
 *   post:
 *     summary: Créer un nouveau type de véhicule (Admin only)
 *     tags: [VehicleTypes]
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
 *               code: { type: string }
 *               iconKey: { type: string }
 *               sortOrder: { type: number }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: Créé
 */
router.get("/", listVehicleTypes);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createVehicleType);

/**
 * @swagger
 * /vehicle-types/{id}:
 *   patch:
 *     summary: Modifier un type de véhicule (Admin only)
 *     tags: [VehicleTypes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: countryId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Mis à jour
 *   delete:
 *     summary: Supprimer un type de véhicule (Admin only)
 *     tags: [VehicleTypes]
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
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateVehicleType);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteVehicleType);

/**
 * @swagger
 * /vehicle-types/{id}/activate:
 *   patch:
 *     summary: Activer un type de véhicule (Admin only)
 *     tags: [VehicleTypes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Activé
 */
router.patch("/:id/activate", authenticate, authorize(PRIVILEGED_ROLES), activateVehicleType);

/**
 * @swagger
 * /vehicle-types/{id}/deactivate:
 *   patch:
 *     summary: Désactiver un type de véhicule (Admin only)
 *     tags: [VehicleTypes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Désactivé
 */
router.patch("/:id/deactivate", authenticate, authorize(PRIVILEGED_ROLES), deactivateVehicleType);

export default router;

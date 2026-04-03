import express from "express";
import {
  listDriverVehicles,
  getDriverVehicle,
  createDriverVehicle,
  updateDriverVehicle,
  deleteDriverVehicle,
  activateDriverVehicle,
} from "./driver-vehicles.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: DriverVehicles
 *   description: Gestion des véhicules des livreurs
 */

/**
 * @swagger
 * /driver-vehicles:
 *   get:
 *     summary: Liste des véhicules des livreurs (Admin only)
 *     tags: [DriverVehicles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: driverId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: isPrimary
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des véhicules
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listDriverVehicles);

/**
 * @swagger
 * /driver-vehicles:
 *   post:
 *     summary: Enregistrer un nouveau véhicule (Admin only)
 *     tags: [DriverVehicles]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId, type, plateNumber]
 *             properties:
 *               driverId: { type: string }
 *               type: { type: string, example: moto }
 *               plateNumber: { type: string, example: "AB 1234 RB" }
 *               brand: { type: string }
 *               model: { type: string }
 *               year: { type: number }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *               isPrimary: { type: boolean }
 *     responses:
 *       201:
 *         description: Véhicule créé
 */
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createDriverVehicle);

/**
 * @swagger
 * /driver-vehicles/{id}:
 *   get:
 *     summary: Voir les détails d'un véhicule (Admin only)
 *     tags: [DriverVehicles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails du véhicule
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getDriverVehicle);

/**
 * @swagger
 * /driver-vehicles/{id}:
 *   patch:
 *     summary: Modifier un véhicule (Admin only)
 *     tags: [DriverVehicles]
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
 *               type: { type: string }
 *               plateNumber: { type: string }
 *               brand: { type: string }
 *               model: { type: string }
 *               year: { type: number }
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *               isPrimary: { type: boolean }
 *     responses:
 *       200:
 *         description: Véhicule mis à jour
 */
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateDriverVehicle);

/**
 * @swagger
 * /driver-vehicles/{id}:
 *   delete:
 *     summary: Supprimer un véhicule (Admin only)
 *     tags: [DriverVehicles]
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
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteDriverVehicle);

/**
 * @swagger
 * /driver-vehicles/{id}/activate:
 *   patch:
 *     summary: Définir comme véhicule principal (Admin only)
 *     tags: [DriverVehicles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Véhicule activé
 */
router.patch("/:id/activate", authenticate, authorize(PRIVILEGED_ROLES), activateDriverVehicle);

export default router;

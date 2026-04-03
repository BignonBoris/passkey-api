import express from "express";
import {
  createMyAddress,
  deleteMyAddress,
  listMyAddresses,
  updateMyAddress,
} from "./addresses.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Addresses
 *   description: Gestion des adresses enregistrées des utilisateurs
 */

/**
 * @swagger
 * /addresses/me:
 *   get:
 *     summary: Liste de mes adresses enregistrées
 *     tags: [Addresses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des adresses
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/AddressListResponse"
 */
router.get("/me", authenticate, listMyAddresses);

/**
 * @swagger
 * /addresses/me:
 *   post:
 *     summary: Enregistrer une nouvelle adresse
 *     tags: [Addresses]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label, mapLabel, latitude, longitude]
 *             properties:
 *               label: { type: string, example: "Maison" }
 *               mapLabel: { type: string, example: "Rue 123, Cotonou" }
 *               latitude: { type: number, example: 6.37 }
 *               longitude: { type: number, example: 2.39 }
 *     responses:
 *       201:
 *         description: Adresse créée
 */
router.post("/me", authenticate, createMyAddress);

/**
 * @swagger
 * /addresses/me/{id}:
 *   patch:
 *     summary: Mettre à jour une adresse existante
 *     tags: [Addresses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label: { type: string }
 *               mapLabel: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       200:
 *         description: Adresse mise à jour
 */
router.patch("/me/:id", authenticate, updateMyAddress);

/**
 * @swagger
 * /addresses/me/{id}:
 *   delete:
 *     summary: Supprimer une adresse
 *     tags: [Addresses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Adresse supprimée
 */
router.delete("/me/:id", authenticate, deleteMyAddress);

export default router;

import express from "express";
import {
  assignUserCountryByGps,
  createCountry,
  getCountry,
  listCountries,
  resolveCountryByGps,
  updateCountry,
} from "./countries.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Countries
 *   description: Gestion des pays et resolution GPS
 */
/**
 * @swagger
 * /countries:
 *   get:
 *     summary: Lister les pays actifs
 *     tags: [Countries]
 *     responses:
 *       200:
 *         description: Liste des pays
 *   post:
 *     summary: Creer un pays
 *     tags: [Countries]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/Country"
 *     responses:
 *       201:
 *         description: Pays cree
 */
router.get("/", listCountries);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createCountry);
/**
 * @swagger
 * /countries/resolve-by-gps:
 *   post:
 *     summary: Resoudre un pays a partir de coordonnees GPS
 *     tags: [Countries]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       200:
 *         description: Pays resolu
 */
router.post("/resolve-by-gps", resolveCountryByGps);
/**
 * @swagger
 * /countries/assign-user-by-gps:
 *   post:
 *     summary: Assigner un pays a un utilisateur a partir de sa position GPS
 *     tags: [Countries]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, latitude, longitude]
 *             properties:
 *               userId: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       200:
 *         description: Pays assigne
 */
router.post("/assign-user-by-gps", authenticate, assignUserCountryByGps);
/**
 * @swagger
 * /countries/{id}:
 *   get:
 *     summary: Charger un pays
 *     tags: [Countries]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Pays charge
 *   patch:
 *     summary: Modifier un pays
 *     tags: [Countries]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Pays mis a jour
 */
router.get("/:id", getCountry);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateCountry);

export default router;

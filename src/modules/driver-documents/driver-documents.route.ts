import express from "express";
import {
  listDriverDocuments,
  getDriverDocument,
  createDriverDocument,
  updateDriverDocument,
  deleteDriverDocument,
  getMyDriverOnboardingStatus,
  listMyDriverVehicleTypes,
  submitMyDriverOnboarding,
  updateMyDriverOnboarding,
} from "./driver-documents.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";
import { driverDocsUpload } from "@/middlewares/upload.middleware";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: DriverDocuments
 *   description: Gestion des documents et de l'onboarding des livreurs
 */

/**
 * @swagger
 * /driver-documents:
 *   get:
 *     summary: Liste des documents des livreurs (Admin only)
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des documents
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listDriverDocuments);

/**
 * @swagger
 * /driver-documents:
 *   post:
 *     summary: Créer manuellement un document pour un livreur (Admin only)
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, type]
 *             properties:
 *               userId: { type: string }
 *               type: { type: string }
 *               url: { type: string }
 *               expiresAt: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Document créé
 */
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createDriverDocument);

/**
 * @swagger
 * /driver-documents/me/status:
 *   get:
 *     summary: Consulter mon état d'onboarding (Livreur)
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: État de l'onboarding
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/DriverOnboardingStatus"
 */
router.get("/me/status", authenticate, authorize(["livreur"]), getMyDriverOnboardingStatus);

/**
 * @swagger
 * /driver-documents/me/vehicle-types:
 *   get:
 *     summary: Liste des types de véhicules autorisés
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des types de véhicules
 */
router.get("/me/vehicle-types", authenticate, authorize(["livreur"]), listMyDriverVehicleTypes);

/**
 * @swagger
 * /driver-documents/me/onboarding:
 *   post:
 *     summary: Soumettre mon dossier complet (Onboarding livreur)
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [fullName, city, dateOfBirth, vehicleType, brand, year, plateNumber, idCard, driverLicense, idPhoto, vehicleRegistration, vehicleInsurance]
 *             properties:
 *               fullName: { type: string }
 *               email: { type: string }
 *               city: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               vehicleType: { type: string }
 *               brand: { type: string }
 *               year: { type: number }
 *               plateNumber: { type: string }
 *               idCard: { type: string, format: binary }
 *               driverLicense: { type: string, format: binary }
 *               idPhoto: { type: string, format: binary }
 *               vehicleRegistration: { type: string, format: binary }
 *               vehicleInsurance: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Dossier soumis
 */
router.post(
  "/me/onboarding",
  authenticate,
  authorize(["livreur"]),
  driverDocsUpload.fields([
    { name: "idCard", maxCount: 1 },
    { name: "driverLicense", maxCount: 1 },
    { name: "idPhoto", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "vehicleInsurance", maxCount: 1 },
  ]),
  submitMyDriverOnboarding
);

/**
 * @swagger
 * /driver-documents/me/onboarding:
 *   patch:
 *     summary: Mettre à jour mon dossier (Onboarding livreur)
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               email: { type: string }
 *               city: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               vehicleType: { type: string }
 *               brand: { type: string }
 *               year: { type: number }
 *               plateNumber: { type: string }
 *               idCard: { type: string, format: binary }
 *               driverLicense: { type: string, format: binary }
 *               idPhoto: { type: string, format: binary }
 *               vehicleRegistration: { type: string, format: binary }
 *               vehicleInsurance: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Dossier mis à jour
 */
router.patch(
  "/me/onboarding",
  authenticate,
  authorize(["livreur"]),
  driverDocsUpload.fields([
    { name: "idCard", maxCount: 1 },
    { name: "driverLicense", maxCount: 1 },
    { name: "idPhoto", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "vehicleInsurance", maxCount: 1 },
  ]),
  updateMyDriverOnboarding
);

/**
 * @swagger
 * /driver-documents/{id}:
 *   get:
 *     summary: Voir un document spécifique (Admin only)
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails du document
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getDriverDocument);

/**
 * @swagger
 * /driver-documents/{id}:
 *   patch:
 *     summary: Mettre à jour (ou valider) un document (Admin only)
 *     tags: [DriverDocuments]
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
 *               status: { type: string, enum: [PENDING, APPROVED, REJECTED] }
 *               url: { type: string }
 *               expiresAt: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Document mis à jour
 */
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateDriverDocument);

/**
 * @swagger
 * /driver-documents/{id}:
 *   delete:
 *     summary: Supprimer un document (Admin only)
 *     tags: [DriverDocuments]
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
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteDriverDocument);

export default router;

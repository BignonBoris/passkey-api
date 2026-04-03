import express from "express";
import {
  updateToken,
  updateProfile,
  getMyProfile,
  updateMyProfile,
  getUsers,
  updateUserAccountStatus,
  getUserById,
  getUserHistory,
  updateIdentityVerified,
  updateUserLocation,
  updateMyAvailability,
  deleteUser,
} from "./user.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";
import { userProfileUpload } from "../../middlewares/upload.middleware";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Gestion des utilisateurs et profils
 */

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Obtenir mon propre profil (Usager/Livreur)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profil retourné
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UserResponse"
 */
router.get("/me", authenticate, getMyProfile);

/**
 * @swagger
 * /users/me/availability:
 *   patch:
 *     summary: Mettre à jour ma disponibilité (Livreur uniquement)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isAvailable: { type: boolean }
 *     responses:
 *       200:
 *         description: Disponibilité mise à jour
 */
router.patch("/me/availability", authenticate, updateMyAvailability);

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Mettre à jour mon profil
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               password: { type: string }
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Profil mis à jour
 */
router.patch("/me", authenticate, userProfileUpload.single("avatar"), updateMyProfile);

/**
 * @swagger
 * /users:
 *   put:
 *     summary: Mettre à jour le FCM Token pour les notifications
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fcmToken: { type: string }
 *     responses:
 *       200:
 *         description: Token mis à jour
 */
router.put("/", authenticate, updateToken);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Liste des utilisateurs (Admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [usager, livreur, admin, sous-admin] }
 *       - in: query
 *         name: accountStatus
 *         schema: { type: string, enum: [active, suspended] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des utilisateurs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UserListResponse"
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), getUsers);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Obtenir un utilisateur par son ID (Admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Utilisateur retourné
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getUserById);

/**
 * @swagger
 * /users/{id}/history:
 *   get:
 *     summary: Historique des changements de statut d'un utilisateur
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Historique retourné
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/StatusHistoryListResponse"
 */
router.get("/:id/history", authenticate, authorize(PRIVILEGED_ROLES), getUserHistory);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Mettre à jour un utilisateur (Admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Utilisateur mis à jour
 */
router.put("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateProfile);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Supprimer un utilisateur (Admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Utilisateur supprimé
 */
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteUser);

/**
 * @swagger
 * /users/{id}/status:
 *   patch:
 *     summary: Changer le statut du compte (Actif/Suspendu)
 *     tags: [Users]
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
 *             $ref: "#/components/schemas/UpdateAccountStatusRequest"
 *     responses:
 *       200:
 *         description: Statut mis à jour
 */
router.patch("/:id/status", authenticate, authorize(PRIVILEGED_ROLES), updateUserAccountStatus);

/**
 * @swagger
 * /users/{id}/identity:
 *   patch:
 *     summary: Valider l'identité d'un utilisateur (Admin only)
 *     tags: [Users]
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
 *             $ref: "#/components/schemas/IdentityUpdateRequest"
 *     responses:
 *       200:
 *         description: Identité validée
 */
router.patch("/:id/identity", authenticate, authorize(PRIVILEGED_ROLES), updateIdentityVerified);

/**
 * @swagger
 * /users/{id}/location:
 *   patch:
 *     summary: Mettre à jour la position GPS (Flow livreur mobile)
 *     tags: [Users]
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
 *             $ref: "#/components/schemas/LocationUpdateRequest"
 *     responses:
 *       200:
 *         description: Position mise à jour
 */
router.patch("/:id/location", authenticate, updateUserLocation);

export default router;

import { Router } from "express";
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
  deleteUser,
} from "./user.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";
import { userProfileUpload } from "../../middlewares/upload.middleware";

const router = Router();

router.get("/", getUsers);
router.get("/me", authenticate, getMyProfile);
router.get("/:id", getUserById);
router.get("/:id/history", authenticate, authorize(PRIVILEGED_ROLES), getUserHistory);
router.put("/", updateToken);
router.patch("/me", authenticate, userProfileUpload.single("avatar"), updateMyProfile);
router.put("/:id", updateProfile);
router.patch("/:id/status", authenticate, authorize(PRIVILEGED_ROLES), updateUserAccountStatus);
router.patch("/:id/identity", authenticate, authorize(PRIVILEGED_ROLES), updateIdentityVerified);
router.patch("/:id/location", authenticate, updateUserLocation);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteUser);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Users management
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List users with filters
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [usager, livreur, admin, sous-admin]
 *       - in: query
 *         name: accountStatus
 *         schema:
 *           type: string
 *           enum: [active, suspended]
 *       - in: query
 *         name: identityVerified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isAvailable
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Users list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UserListResponse"
 */

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a user by id
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UserResponse"
 *       404:
 *         description: User not found
 */

/**
 * @swagger
 * /users/{id}/history:
 *   get:
 *     summary: Get user status history
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User status history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/StatusHistoryListResponse"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /users/{id}/status:
 *   patch:
 *     summary: Update user account status (suspend/reactivate)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/UpdateAccountStatusRequest"
 *     responses:
 *       200:
 *         description: User status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UserResponse"
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */

/**
 * @swagger
 * /users/{id}/identity:
 *   patch:
 *     summary: Update user identity verification
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/IdentityUpdateRequest"
 *     responses:
 *       200:
 *         description: Identity verification updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/UserResponse"
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */

/**
 * @swagger
 * /users/{id}/location:
 *   patch:
 *     summary: Update user location (latitude/longitude)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/LocationUpdateRequest"
 *     responses:
 *       200:
 *         description: Location updated
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */

export default router;

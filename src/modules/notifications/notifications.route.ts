import express from "express";
import {
  listNotificationLogs,
  getNotificationLog,
  createNotificationLog,
  updateNotificationLog,
  deleteNotificationLog,
} from "./notifications.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List notification logs
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *   post:
 *     summary: Create notification log
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listNotificationLogs);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createNotificationLog);

/**
 * @swagger
 * /notifications/{id}:
 *   get:
 *     summary: Get notification log
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     summary: Update notification log
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     summary: Delete notification log
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getNotificationLog);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateNotificationLog);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteNotificationLog);

export default router;

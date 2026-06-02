import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";
import {
  createAdminNotification,
  getAdminNotificationById,
  getAdminNotificationUnreadCount,
  listAdminNotifications,
  markAdminNotificationAsRead,
  markAllAdminNotificationsAsRead,
} from "./admin-notifications.controller";

const router = express.Router();

router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listAdminNotifications);
router.get("/unread-count", authenticate, authorize(PRIVILEGED_ROLES), getAdminNotificationUnreadCount);
router.patch("/read-all", authenticate, authorize(PRIVILEGED_ROLES), markAllAdminNotificationsAsRead);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createAdminNotification);
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getAdminNotificationById);
router.patch("/:id/read", authenticate, authorize(PRIVILEGED_ROLES), markAdminNotificationAsRead);

export default router;

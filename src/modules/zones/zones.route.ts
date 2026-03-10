const express = require("express");
import {
  listZones,
  getZone,
  createZone,
  updateZone,
  deleteZone,
} from "./zones.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * /zones:
 *   get:
 *     summary: List zones
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 *   post:
 *     summary: Create zone
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listZones);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createZone);

/**
 * @swagger
 * /zones/{id}:
 *   get:
 *     summary: Get zone
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     summary: Update zone
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     summary: Delete zone
 *     tags: [Zones]
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getZone);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateZone);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteZone);

module.exports = router;

const express = require("express");
import {
  listIncidents,
  getIncident,
  createIncident,
  updateIncident,
  deleteIncident,
} from "./incidents.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * /incidents:
 *   get:
 *     summary: List incidents
 *     tags: [Incidents]
 *     security:
 *       - BearerAuth: []
 *   post:
 *     summary: Create incident
 *     tags: [Incidents]
 *     security:
 *       - BearerAuth: []
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listIncidents);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createIncident);

/**
 * @swagger
 * /incidents/{id}:
 *   get:
 *     summary: Get incident
 *     tags: [Incidents]
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     summary: Update incident
 *     tags: [Incidents]
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     summary: Delete incident
 *     tags: [Incidents]
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getIncident);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateIncident);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteIncident);

module.exports = router;

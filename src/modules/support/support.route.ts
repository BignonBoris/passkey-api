const express = require("express");
import {
  listSupportTickets,
  getSupportTicket,
  createSupportTicket,
  updateSupportTicket,
  deleteSupportTicket,
  postSupportTicketMessage,
} from "./support.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * /support/tickets:
 *   get:
 *     summary: List support tickets
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *   post:
 *     summary: Create support ticket
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 */
router.get("/tickets", authenticate, listSupportTickets);
router.post("/tickets", authenticate, createSupportTicket);

/**
 * @swagger
 * /support/tickets/{id}:
 *   get:
 *     summary: Get support ticket
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     summary: Update support ticket
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     summary: Delete support ticket
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 */
router.get("/tickets/:id", authenticate, getSupportTicket);
router.patch("/tickets/:id", authenticate, authorize(PRIVILEGED_ROLES), updateSupportTicket);
router.delete("/tickets/:id", authenticate, deleteSupportTicket);
router.post("/tickets/:id/messages", authenticate, postSupportTicketMessage);

module.exports = router;

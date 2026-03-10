const express = require("express");
import {
  listRefunds,
  getRefund,
  createRefund,
  updateRefund,
  deleteRefund,
} from "./refunds.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

/**
 * @swagger
 * /refunds:
 *   get:
 *     summary: List refunds
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 *   post:
 *     summary: Create refund
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listRefunds);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createRefund);

/**
 * @swagger
 * /refunds/{id}:
 *   get:
 *     summary: Get refund
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     summary: Update refund
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     summary: Delete refund
 *     tags: [Refunds]
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getRefund);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateRefund);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteRefund);

module.exports = router;

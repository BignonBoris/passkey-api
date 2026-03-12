const express = require("express");
import {
  listKycRequests,
  getKycRequest,
  createKycRequest,
  updateKycRequest,
  deleteKycRequest,
} from "./kyc.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

/**
 * @swagger
 * /kyc:
 *   get:
 *     summary: List KYC/KYB requests
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: KYC list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: "#/components/schemas/KycRequest" }
 *   post:
 *     summary: Create KYC/KYB request
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: KYC created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/KycRequest" }
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listKycRequests);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createKycRequest);

/**
 * @swagger
 * /kyc/{id}:
 *   get:
 *     summary: Get KYC/KYB request
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KYC detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/KycRequest" }
 *   patch:
 *     summary: Update KYC/KYB request
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     summary: Delete KYC/KYB request
 *     tags: [KYC]
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getKycRequest);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateKycRequest);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteKycRequest);

module.exports = router;

import { Router } from "express";
import {
  listPromotions,
  getPromotion,
  createPromotion,
  updatePromotion,
  deletePromotion,
  listPromotionRedemptions,
  createPromotionRedemption,
} from "./promotions.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = Router();

/**
 * @swagger
 * /promotions:
 *   get:
 *     summary: List promotions
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 *   post:
 *     summary: Create promotion
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 */
router.get("/redemptions/list", authenticate, authorize(PRIVILEGED_ROLES), listPromotionRedemptions);
router.post("/redemptions", authenticate, authorize(PRIVILEGED_ROLES), createPromotionRedemption);

router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listPromotions);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createPromotion);

/**
 * @swagger
 * /promotions/{id}:
 *   get:
 *     summary: Get promotion
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     summary: Update promotion
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     summary: Delete promotion
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getPromotion);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updatePromotion);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deletePromotion);

/**
 * @swagger
 * /promotions/redemptions/list:
 *   get:
 *     summary: List promotion redemptions
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 * /promotions/redemptions:
 *   post:
 *     summary: Create promotion redemption
 *     tags: [Promotions]
 *     security:
 *       - BearerAuth: []
 */

export default router;

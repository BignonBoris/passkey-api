const express = require("express");
import {
  calculatePricing,
  createOrUpdatePricingConfig,
  deletePricingConfig,
  listPricingConfigs,
  updatePricingConfig,
} from "./pricing.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";

const router = express.Router();

router.get("/configs", authenticate, authorize(PRIVILEGED_ROLES), listPricingConfigs);
router.post("/configs", authenticate, authorize(PRIVILEGED_ROLES), createOrUpdatePricingConfig);
router.patch("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), updatePricingConfig);
router.delete("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), deletePricingConfig);
router.post("/calculate", authenticate, authorize(PRIVILEGED_ROLES), calculatePricing);

module.exports = router;

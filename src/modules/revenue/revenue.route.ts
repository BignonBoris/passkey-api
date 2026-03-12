const express = require("express");
import {
  listRevenueConfigs,
  getRevenueConfig,
  createOrUpdateRevenueConfig,
  updateRevenueConfig,
  deleteRevenueConfig,
  calculateRevenue,
} from "./revenue.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

router.get("/configs", authenticate, authorize(PRIVILEGED_ROLES), listRevenueConfigs);
router.get("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), getRevenueConfig);
router.post("/configs", authenticate, authorize(PRIVILEGED_ROLES), createOrUpdateRevenueConfig);
router.patch("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), updateRevenueConfig);
router.delete("/configs/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteRevenueConfig);
router.post("/calculate", authenticate, authorize(PRIVILEGED_ROLES), calculateRevenue);

module.exports = router;

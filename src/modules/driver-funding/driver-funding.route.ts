import { Router } from "express";
import * as DriverFundingController from "./driver-funding.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = Router();

// Routes pour l'application mobile
router.get("/my-balance", authenticate, DriverFundingController.getMyBalance);
router.get("/my-history", authenticate, DriverFundingController.getMyFundingHistory);

// Routes pour l'administration
router.get("/:driverId/balance", authenticate, authorize(PRIVILEGED_ROLES), DriverFundingController.getDriverBalance);
router.post("/:driverId/recharge", authenticate, authorize(PRIVILEGED_ROLES), DriverFundingController.fundDriver);
router.get("/:driverId/history", authenticate, authorize(PRIVILEGED_ROLES), DriverFundingController.getFundingHistory);

export default router;

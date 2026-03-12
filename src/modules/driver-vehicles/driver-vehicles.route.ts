const express = require("express");
import {
  listDriverVehicles,
  getDriverVehicle,
  createDriverVehicle,
  updateDriverVehicle,
  deleteDriverVehicle,
  activateDriverVehicle,
} from "./driver-vehicles.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listDriverVehicles);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createDriverVehicle);
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getDriverVehicle);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateDriverVehicle);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteDriverVehicle);
router.patch("/:id/activate", authenticate, authorize(PRIVILEGED_ROLES), activateDriverVehicle);

module.exports = router;

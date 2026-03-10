const express = require("express");
import {
  listDriverDocuments,
  getDriverDocument,
  createDriverDocument,
  updateDriverDocument,
  deleteDriverDocument,
  getMyDriverOnboardingStatus,
  listMyDriverVehicleTypes,
  submitMyDriverOnboarding,
  updateMyDriverOnboarding,
} from "./driver-documents.controller";
import { authenticate, authorize } from "@/middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "@/constants/roles";
import { driverDocsUpload } from "@/middlewares/upload.middleware";

const router = express.Router();

/**
 * @swagger
 * /driver-documents:
 *   get:
 *     summary: List driver documents
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *   post:
 *     summary: Create driver document
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 */
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listDriverDocuments);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createDriverDocument);
router.get("/me/status", authenticate, authorize(["livreur"]), getMyDriverOnboardingStatus);
router.get("/me/vehicle-types", authenticate, authorize(["livreur"]), listMyDriverVehicleTypes);
router.post(
  "/me/onboarding",
  authenticate,
  authorize(["livreur"]),
  driverDocsUpload.fields([
    { name: "idCard", maxCount: 1 },
    { name: "driverLicense", maxCount: 1 },
    { name: "idPhoto", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "vehicleInsurance", maxCount: 1 },
  ]),
  submitMyDriverOnboarding
);
router.patch(
  "/me/onboarding",
  authenticate,
  authorize(["livreur"]),
  driverDocsUpload.fields([
    { name: "idCard", maxCount: 1 },
    { name: "driverLicense", maxCount: 1 },
    { name: "idPhoto", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "vehicleInsurance", maxCount: 1 },
  ]),
  updateMyDriverOnboarding
);

/**
 * @swagger
 * /driver-documents/{id}:
 *   get:
 *     summary: Get driver document
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     summary: Update driver document
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     summary: Delete driver document
 *     tags: [DriverDocuments]
 *     security:
 *       - BearerAuth: []
 */
router.get("/:id", authenticate, authorize(PRIVILEGED_ROLES), getDriverDocument);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateDriverDocument);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteDriverDocument);

module.exports = router;

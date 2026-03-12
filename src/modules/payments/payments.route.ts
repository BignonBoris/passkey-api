import { authenticate } from "../../middlewares/auth.middleware";
import {
  createOrderPaymentCheckout,
  createTestPaymentCheckout,
  getPaymentStatus,
  handleFedaPayCallback,
  syncPaymentStatus,
} from "./payments.controller";

const express = require("express");
const router = express.Router();

router.post("/test-checkout", authenticate, createTestPaymentCheckout);
router.post("/orders/:orderId/checkout", authenticate, createOrderPaymentCheckout);
router.get("/fedapay/callback", handleFedaPayCallback);
router.get("/:paymentId", authenticate, getPaymentStatus);
router.post("/:paymentId/sync", authenticate, syncPaymentStatus);

module.exports = router;

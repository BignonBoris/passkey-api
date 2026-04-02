import { authenticate } from "@/middlewares/auth.middleware";
import {
  createOrderPaymentCheckout,
  selectOrderCashPayment,
  markOrderCashPaymentPaid,
  createTestPaymentCheckout,
  getPaymentStatus,
  handleFedaPayCallback,
  syncPaymentStatus,
} from "./payments.controller";

import express from "express";
const router = express.Router();

router.post("/test-checkout", authenticate, createTestPaymentCheckout);
router.post("/orders/:orderId/checkout", authenticate, createOrderPaymentCheckout);
router.post("/orders/:orderId/select-cash", authenticate, selectOrderCashPayment);
router.post("/orders/:orderId/mark-cash-paid", authenticate, markOrderCashPaymentPaid);
router.get("/fedapay/callback", handleFedaPayCallback);
router.get("/:paymentId", authenticate, getPaymentStatus);
router.post("/:paymentId/sync", authenticate, syncPaymentStatus);

export default router;

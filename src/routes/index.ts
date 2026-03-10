import { Router } from "express";
import authRoutes from "../modules/auth/auth.route";
const mapsRoutes = require('../modules/maps/maps.route');
const ordersRoutes = require('../modules/order/order.routes');
const usersRoutes = require('../modules/users/user.route');
const dashboardRoutes = require("../modules/dashboard/dashboard.route");
const kycRoutes = require("../modules/kyc/kyc.route");
const driverDocumentsRoutes = require("../modules/driver-documents/driver-documents.route");
const driverVehiclesRoutes = require("../modules/driver-vehicles/driver-vehicles.route");
const supportRoutes = require("../modules/support/support.route");
const promotionsRoutes = require("../modules/promotions/promotions.route");
const refundsRoutes = require("../modules/refunds/refunds.route");
const notificationsRoutes = require("../modules/notifications/notifications.route");
const incidentsRoutes = require("../modules/incidents/incidents.route");
const zonesRoutes = require("../modules/zones/zones.route");
const revenueRoutes = require("../modules/revenue/revenue.route");
const pricingRoutes = require("../modules/pricing/pricing.route");
const faqsRoutes = require("../modules/faqs/faqs.route");
const chatRoutes = require("../modules/chat/chat.route");
const settingsRoutes = require("../modules/settings/settings.route");
const addressesRoutes = require("../modules/addresses/addresses.route");

const router = Router();

router.use("/auth", authRoutes);
router.use('/maps', mapsRoutes);
router.use('/orders', ordersRoutes);
router.use('/users', usersRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/dashboar", dashboardRoutes);
router.use("/kyc", kycRoutes);
router.use("/driver-documents", driverDocumentsRoutes);
router.use("/driver-vehicles", driverVehiclesRoutes);
router.use("/support", supportRoutes);
router.use("/promotions", promotionsRoutes);
router.use("/refunds", refundsRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/incidents", incidentsRoutes);
router.use("/zones", zonesRoutes);
router.use("/revenue", revenueRoutes);
router.use("/pricing", pricingRoutes);
router.use("/faqs", faqsRoutes);
router.use("/chat", chatRoutes);
router.use("/settings", settingsRoutes);
router.use("/addresses", addressesRoutes);

export default router;


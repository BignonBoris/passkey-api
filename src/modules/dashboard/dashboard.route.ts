import { Router } from "express";
import { getDashboardOverview, getDashboardTrends } from "./dashboard.controller";

const router = Router();

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Dashboard overview
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Dashboard loaded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/DashboardOverviewResponse"
 */
router.get("/", getDashboardOverview);

/**
 * @swagger
 * /dashboard/trends:
 *   get:
 *     summary: Dashboard trends
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Trend data for charts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     daily:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           newUsers:
 *                             type: integer
 *                           newDrivers:
 *                             type: integer
 *                           ordersCreated:
 *                             type: integer
 *                           ordersCompleted:
 *                             type: integer
 *                           payments:
 *                             type: number
 */
router.get("/trends", getDashboardTrends);
export default router;

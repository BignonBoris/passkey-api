import {
  acceptDeliveryByDriver,
  assignNearestDriver,
  archiveOrder,
  bulkDeleteOrders,
  createDeliveryRequest,
  createOrder,
  deleteOrder,
  getDeliveryTracking,
  getOrders,
  driverArrivedPickup,
  driverLeftPickup,
  cancelDelivery,
  estimateCancellation,
  updateDeliveryStatus,
  updateDriverLocationForDelivery,
  updateOrderStatus
} from "./order.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";
import { Router } from "express";

const router = Router();


// Quand on appelle POST sur / (la racine de ce groupe), on lance createOrder
router.post('/', createOrder);
router.get('/', getOrders);
router.put('/:orderId/status', updateOrderStatus);
router.patch('/:orderId/archive', authenticate, authorize(PRIVILEGED_ROLES), archiveOrder);
router.delete('/:orderId', authenticate, authorize(PRIVILEGED_ROLES), deleteOrder);
router.post('/bulk-delete', authenticate, authorize(PRIVILEGED_ROLES), bulkDeleteOrders);
router.post('/deliveries', createDeliveryRequest);
router.post('/deliveries/:orderId/assign-nearest', assignNearestDriver);
router.post('/deliveries/:orderId/accept', acceptDeliveryByDriver);
router.post('/deliveries/:orderId/driver-arrived-pickup', driverArrivedPickup);
router.post('/deliveries/:orderId/driver-left-pickup', driverLeftPickup);
router.post('/deliveries/:orderId/cancel', cancelDelivery);
router.get('/deliveries/:orderId/cancellation-estimate', estimateCancellation);
router.patch('/deliveries/:orderId/status', updateDeliveryStatus);
router.patch('/deliveries/:orderId/driver-location', updateDriverLocationForDelivery);
router.get('/deliveries/:orderId/tracking', getDeliveryTracking);

/**
 * @swagger
 * /orders/deliveries:
 *   post:
 *     summary: Create a delivery request
 *     tags: [Order]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - pickupLocation
 *               - pickupAddress
 *               - destinationLocation
 *               - destinationAddress
 *               - vehicleType
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 example: "11111111-1111-1111-1111-111111111111"
 *               pickupLocation:
 *                 type: string
 *                 example: "5.3480,-4.0083"
 *               pickupAddress:
 *                 type: string
 *                 example: "Cocody Angre, Abidjan"
 *               destinationLocation:
 *                 type: string
 *                 example: "5.3204,-4.0161"
 *               destinationAddress:
 *                 type: string
 *                 example: "Plateau, Abidjan"
 *               price:
 *                 type: number
 *                 format: float
 *                 example: 2500
 *               revenuePerDelivery:
 *                 type: number
 *                 format: float
 *                 description: Revenu net du livreur pour cette livraison (optionnel, calcule automatiquement si absent)
 *                 example: 1800
 *               distance:
 *                 type: string
 *                 example: "8.5 km"
 *               vehicleType:
 *                 type: string
 *                 example: "moto"
 *     responses:
 *       201:
 *         description: Delivery request created
 */

/**
 * @swagger
 * /orders/deliveries/{orderId}/assign-nearest:
 *   post:
 *     summary: Assign the nearest available driver
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver assigned
 */

/**
 * @swagger
 * /orders/deliveries/{orderId}/accept:
 *   post:
 *     summary: Driver accepts a delivery
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delivery accepted
 */

/**
 * @swagger
 * /orders/deliveries/{orderId}/status:
 *   patch:
 *     summary: Update delivery status
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status updated
 */

/**
 * @swagger
 * /orders/deliveries/{orderId}/driver-location:
 *   patch:
 *     summary: Update driver live location for tracking
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver location updated
 */

/**
 * @swagger
 * /orders/deliveries/{orderId}/tracking:
 *   get:
 *     summary: Get tracking details for a delivery
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tracking loaded
 */

/**
 * @swagger
 * tags:
 *   name: Order
 */
export default router;

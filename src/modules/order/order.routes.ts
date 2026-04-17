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
  broadcastDriverLocationForDelivery,
  cancelDelivery,
  estimateCancellation,
  submitOrderRating,
  updateDeliveryStatus,
  updateDriverLocationForDelivery,
  updateOrderStatus
} from './order.controller';
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";
const express = require('express');
const router = express.Router();


/**
 * @swagger
 * tags:
 *   name: Order
 *   description: Gestion des commandes et des livraisons
 */

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Créer une commande de course (Flow usager)
 *     tags: [Order]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, pickupLocation, destinationLocation, pickupAddress, destinationAddress, vehicleId, distance]
 *             properties:
 *               userId: { type: string, format: uuid }
 *               pickupLocation: { type: string, example: "6.37,2.39" }
 *               pickupAddress: { type: string, example: "Rue 123, Cotonou" }
 *               destinationLocation: { type: string, example: "6.38,2.40" }
 *               destinationAddress: { type: string, example: "Rue 456, Cotonou" }
 *               vehicleId: { type: string, example: "moto" }
 *               distance: { type: string, example: "5.2 km" }
 *               durationMinutes: { type: number, example: 15 }
 *               extras: { type: number }
 *               tip: { type: number }
 *               pickupTimestamp: { type: string, format: date-time }
 *               simulationMode: { type: boolean }
 *     responses:
 *       201:
 *         description: Commande créée
 */
router.post('/', createOrder);

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Liste des commandes avec filtres
 *     tags: [Order]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: driverId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: archived
 *         schema: { type: string, enum: [true, false, all] }
 *     responses:
 *       200:
 *         description: Liste des commandes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/OrderListResponse"
 */
router.get('/', getOrders);

/**
 * @swagger
 * /orders/{orderId}/status:
 *   put:
 *     summary: Mettre à jour manuellement le statut d'une commande
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [ACCEPTED, CANCELLED, COMPLETED] }
 *               driverId: { type: string }
 *               completionOtp: { type: string }
 *     responses:
 *       200:
 *         description: Statut mis à jour
 */
router.put('/:orderId/status', updateOrderStatus);

/**
 * @swagger
 * /orders/{orderId}/rating:
 *   post:
 *     summary: Noter le livreur d'une course terminee
 *     tags: [Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: number, example: 5, minimum: 1, maximum: 5 }
 *               comment: { type: string, example: "Tres bonne course" }
 *     responses:
 *       200:
 *         description: Note enregistree
 */
router.post('/:orderId/rating', authenticate, submitOrderRating);

/**
 * @swagger
 * /orders/{orderId}/archive:
 *   patch:
 *     summary: Archiver une commande (Admin only)
 *     tags: [Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Commande archivée
 */
router.patch('/:orderId/archive', authenticate, authorize(PRIVILEGED_ROLES), archiveOrder);

/**
 * @swagger
 * /orders/{orderId}:
 *   delete:
 *     summary: Supprimer une commande (Admin only)
 *     tags: [Order]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Commande supprimée
 */
router.delete('/:orderId', authenticate, authorize(PRIVILEGED_ROLES), deleteOrder);

/**
 * @swagger
 * /orders/bulk-delete:
 *   post:
 *     summary: Supprimer plusieurs commandes (Admin only)
 *     tags: [Order]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderIds: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Commandes supprimées
 */
router.post('/bulk-delete', authenticate, authorize(PRIVILEGED_ROLES), bulkDeleteOrders);

/**
 * @swagger
 * /orders/deliveries:
 *   post:
 *     summary: Créer une demande de livraison (Legacy or Specific)
 *     tags: [Order]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, pickupLocation, pickupAddress, destinationLocation, destinationAddress, vehicleType]
 *             properties:
 *               userId: { type: string }
 *               pickupLocation: { type: string }
 *               pickupAddress: { type: string }
 *               destinationLocation: { type: string }
 *               destinationAddress: { type: string }
 *               price: { type: number }
 *               vehicleType: { type: string }
 *     responses:
 *       201:
 *         description: Demande de livraison créée
 */
router.post('/deliveries', createDeliveryRequest);

/**
 * @swagger
 * /orders/deliveries/{orderId}/assign-nearest:
 *   post:
 *     summary: Assigner le livreur le plus proche à une commande
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Livreur assigné
 */
router.post('/deliveries/:orderId/assign-nearest', assignNearestDriver);

/**
 * @swagger
 * /orders/deliveries/{orderId}/accept:
 *   post:
 *     summary: Un livreur accepte une livraison
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Livraison acceptée
 */
router.post('/deliveries/:orderId/accept', acceptDeliveryByDriver);

/**
 * @swagger
 * /orders/deliveries/{orderId}/driver-arrived-pickup:
 *   post:
 *     summary: Signaler l'arrivée du livreur au point de collecte
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Statut mis à jour
 */
router.post('/deliveries/:orderId/driver-arrived-pickup', driverArrivedPickup);

/**
 * @swagger
 * /orders/deliveries/{orderId}/driver-left-pickup:
 *   post:
 *     summary: Signaler que le livreur a quitté le point de collecte
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Statut mis à jour, frais d'attente calculés
 */
router.post('/deliveries/:orderId/driver-left-pickup', driverLeftPickup);

/**
 * @swagger
 * /orders/deliveries/{orderId}/cancel:
 *   post:
 *     summary: Annuler une livraison
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cancelledBy: { type: string, example: "usager" }
 *     responses:
 *       200:
 *         description: Livraison annulée
 */
router.post('/deliveries/:orderId/cancel', cancelDelivery);

/**
 * @swagger
 * /orders/deliveries/{orderId}/cancellation-estimate:
 *   get:
 *     summary: Estimer les frais d'annulation
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Estimation des frais
 */
router.get('/deliveries/:orderId/cancellation-estimate', estimateCancellation);

/**
 * @swagger
 * /orders/deliveries/{orderId}/status:
 *   patch:
 *     summary: Mettre à jour le statut de livraison (Admin/General)
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Statut mis à jour
 */
router.patch('/deliveries/:orderId/status', updateDeliveryStatus);

/**
 * @swagger
 * /orders/deliveries/{orderId}/driver-location:
 *   patch:
 *     summary: Mettre à jour la position GPS du livreur en temps réel
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Position mise à jour
 */
router.patch('/deliveries/:orderId/driver-location', updateDriverLocationForDelivery);
router.patch('/deliveries/:orderId/driver-location/live', broadcastDriverLocationForDelivery);

/**
 * @swagger
 * /orders/deliveries/{orderId}/tracking:
 *   get:
 *     summary: Obtenir les détails de tracking pour une livraison
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails de tracking retournés
 */
router.get('/deliveries/:orderId/tracking', getDeliveryTracking);

export default router;

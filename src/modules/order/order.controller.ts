import { Request, Response } from 'express';
import {
  sendNotificationToDriver,
  sendPushNotification,
  sendSmsNotification,
} from '../../services/notification.service';
import { Server } from 'socket.io';
import User from '../../models/user.model';
import { Op } from 'sequelize';
import Order from '../../models/order.model';
import UserAddress from '../../models/user-address.model';
import DriverVehicle from "../../models/driver-vehicle.model";
import DriverDocument from "../../models/driver-document.model";
import Payment from "../../models/payment.model";
import { calculateDeliveryPricing, calculateWaitingFees } from "../../services/pricing.service";
import { calculateCancellationFees } from "../../services/cancellation.service";
import { resolveCountryId } from "../../services/country.service";
import AppSettings from '../../models/app-settings.model';
import sequelize from '../../config/database';
import { AuthenticatedRequest } from '../../types/auth-request';

const DELIVERY_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVED_PICKUP",
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
] as const;

const CANCELLATION_BLOCKING_STATUSES = [
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "COMPLETED",
] as const;

function generateCompletionOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeOtp(value: unknown): string {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function normalizeDeliveryStatus(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "IN_PROGRESS" || normalized === "ONGOING" || normalized === "ON_GOING") {
    return "IN_TRANSIT";
  }
  return normalized;
}

async function getOrderPaymentSnapshot(orderId: string) {
  const payment = await Payment.findOne({
    where: { orderId },
    order: [["createdAt", "DESC"]],
  });

  return {
    payment,
    paymentMethod: String(payment?.get("method") || "CASH"),
    paymentStatus: String(payment?.get("status") || "PENDING"),
  };
}

async function notifyUserDeliveryStep(
  order: Order,
  params: { title: string; body: string; type: string; route?: string }
) {
  const user = await User.findByPk(String(order.get("userId") || ""));
  const userToken = String(user?.get("fcmToken") || "").trim();
  if (!userToken) return;

  await sendPushNotification(userToken, params.title, params.body, {
    type: params.type,
    orderId: String(order.get("id") || ""),
    driverId: String(order.get("driverId") || ""),
    status: String(order.get("status") || ""),
    route: params.route || "/app",
  });
}

function parseLatLng(raw?: string): { lat: number; lng: number } | null {
  if (!raw) return null;
  const [latText, lngText] = raw.split(",").map((v) => v.trim());
  const lat = Number(latText);
  const lng = Number(lngText);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function parseNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractDistanceKm(distanceValue: unknown): number {
  if (typeof distanceValue === "number" && Number.isFinite(distanceValue)) {
    return Math.max(0, distanceValue);
  }
  if (typeof distanceValue === "string") {
    const normalized = distanceValue.replace(",", ".");
    const match = normalized.match(/(\d+(\.\d+)?)/);
    if (!match) return 0;
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return 0;
}

function normalizePaymentMethod(value: unknown): "CASH" | "MOBILE_MONEY" {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return normalized === "MOBILE_MONEY" ? "MOBILE_MONEY" : "CASH";
}

function normalizeRatingValue(value: unknown): number | null {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  if (rating < 1 || rating > 5) return null;
  return Math.round(rating * 100) / 100;
}

function resolveParcelNature(input: Record<string, unknown>): string {
  return String(
    input.parcelNature ??
    input.packageNature ??
    input.packageDescription ??
    ""
  ).trim();
}

function resolveDeliveryPhone(input: Record<string, unknown>): string {
  return String(
    input.deliveryPhone ??
    input.delivery_phone ??
    input.receiverPhone ??
    input.receiver_phone ??
    input.destinationPhone ??
    ""
  ).trim();
}

async function sendCompletionOtpSmsIfPossible(params: {
  phone: string;
  otp: string;
  parcelNature?: string;
}) {
  const phone = params.phone.trim();
  const otp = params.otp.trim();
  if (!phone || !otp) return;

  const parcelLabel = params.parcelNature?.trim();
  const message = parcelLabel
    ? `Code OTP PassKey: ${otp}. Communiquez ce code a la livraison du colis "${parcelLabel}".`
    : `Code OTP PassKey: ${otp}. Communiquez ce code a la livraison de votre colis.`;

  await sendSmsNotification(phone, message);
}

async function getDriverSearchRadiusKm(): Promise<number> {
  try {
    const settings = await AppSettings.findOne({ where: { section: 'operations' } });
    if (!settings) return 5;
    const content = settings.get('content');
    const radius = Number(content?.driverLocationDistanceKm);
    return Number.isFinite(radius) && radius > 0 ? radius : 5;
  } catch {
    return 5;
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isTruthyAvailability(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    String(value || "").trim().toLowerCase() === "true" ||
    String(value || "").trim() === "1"
  );
}

function hasUsableFcmToken(value: unknown): boolean {
  const token = String(value || "").trim();
  return token !== "" && token !== "null" && token !== "undefined";
}

async function buildDriverDeliveryRequestPayload(order: Order, paymentRow: any) {
  const orderId = String(order.get('id') || '').trim();
  const userId = String(order.get('userId') || '').trim();
  const pickupCoords = parseLatLng(String(order.get('pickupLocation') || ''));
  const destinationCoords = parseLatLng(String(order.get('destinationLocation') || ''));
  const customer = userId ? await User.findByPk(userId) : null;

  return {
    type: "NEW_DELIVERY_REQUEST",
    requestId: orderId,
    orderId,
    id: orderId,
    order: orderId,
    callerId: userId,
    customerId: userId,
    userId,
    pickupAddress: String(order.get('pickupAddress') || ''),
    deliveryAddress: String(order.get('destinationAddress') || ''),
    destinationAddress: String(order.get('destinationAddress') || ''),
    price: String(order.get('price') || ''),
    distance: String(order.get('distance') || ''),
    vehicleType: String(order.get('vehicleType') || ''),
    vehicleName: String(order.get('vehicleType') || ''),
    pickupLocation: String(order.get('pickupLocation') || ''),
    destinationLocation: String(order.get('destinationLocation') || ''),
    pickupLat: pickupCoords ? String(pickupCoords.lat) : '',
    pickupLng: pickupCoords ? String(pickupCoords.lng) : '',
    destinationLat: destinationCoords ? String(destinationCoords.lat) : '',
    destinationLng: destinationCoords ? String(destinationCoords.lng) : '',
    payment_method: String(paymentRow?.get("method") || "CASH"),
    payment_status: String(paymentRow?.get("status") || "PENDING"),
    paymentMethod: String(paymentRow?.get("method") || "CASH"),
    paymentStatus: String(paymentRow?.get("status") || "PENDING"),
    parcel_nature: String(order.get('parcelNature') || order.get('packageDescription') || ''),
    parcelNature: String(order.get('parcelNature') || order.get('packageDescription') || ''),
    packageNature: String(order.get('parcelNature') || order.get('packageDescription') || ''),
    packageDescription: String(order.get('packageDescription') || order.get('parcelNature') || ''),
    customerName: String(customer?.get('name') || 'Client PassKey'),
    customerPhone: String(customer?.get('phone') || ''),
    customerRating: String(Number(customer?.get('rating') || 0)),
    user_name: String(customer?.get('name') || 'Client PassKey'),
    user_phone: String(customer?.get('phone') || ''),
    user_rating: String(Number(customer?.get('rating') || 0)),
    status: String(order.get('status') || 'PENDING'),
    createdAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
  };
}

async function notifyNearbyDrivers(order: Order, io: Server, pricing: any, paymentRow: any) {
  const pickup = parseLatLng(String(order.get('pickupLocation')));
  if (!pickup) return;

  const radiusKm = await getDriverSearchRadiusKm();
  console.log(`\n[RECHERCHE LIVREURS] Commande ID: ${order.get('id')}`);
  console.log(` - Point de ramassage: ${order.get('pickupLocation')} (${order.get('pickupAddress')})`);
  console.log(` - Rayon de recherche configuré: ${radiusKm} km`);

  const drivers = await User.findAll({
    where: {
      role: 'livreur',
      isActive: true,
      isAvailable: true,
      identityVerified: true,
      accountStatus: 'active',
      fcmToken: { [Op.ne]: null }
    }
  });

  console.log(` - ${drivers.length} livreurs actifs, disponibles et vérifiés trouvés en base.`);

  const nearbyDrivers = drivers.filter(d => {
    if (!isTruthyAvailability(d.get('isAvailable'))) return false;

    // TODO: [TEST] Condition de position GPS désactivée pour les tests
    // if (d.get('latitude') == null || d.get('longitude') == null) return false;
    const dist = (d.get('latitude') != null && d.get('longitude') != null)
      ? calculateDistance(pickup.lat, pickup.lng, Number(d.get('latitude')), Number(d.get('longitude')))
      : 0;

    // TODO: [TEST] Filtre du rayon de recherche désactivé (≤ radiusKm km) — réactiver en production
    // const isNearby = dist <= radiusKm;
    const isNearby = true;

    if (isNearby) {
      console.log(`   -> Livreur [${d.get('id')}] ${d.get('name') ?? 'N/A'} (${d.get('phone')}): SÉLECTIONNÉ (dist: ${dist.toFixed(2)} km, rayon ignoré pour test)`);
    }
    return isNearby;
  });

  console.log(`[RÉSULTAT] ${nearbyDrivers.length} livreurs vont recevoir l'appel de course.\n`);

  const deliveryRequestPayload = await buildDriverDeliveryRequestPayload(order, paymentRow);

  const pushPromises = nearbyDrivers.map(d => {
    const driverId = String(d.get('id') || '').trim();
    const fcmToken = String(d.get('fcmToken') || '').trim();
    if (!driverId) return Promise.resolve();

    io.to(`user_${driverId}`).emit('new_delivery_request', deliveryRequestPayload);
    io.to(`user_${driverId}`).emit('new_ride_request', deliveryRequestPayload);

    if (!hasUsableFcmToken(fcmToken)) {
      return Promise.resolve();
    }

    return sendPushNotification(
      fcmToken,
      "Nouvelle course disponible",
      `Course de ${order.get('price')} FCFA vers ${order.get('destinationAddress')}`,
      deliveryRequestPayload
    );
  });

  await Promise.all(pushPromises);
}

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { userId, pickupLocation, destinationLocation, pickupAddress, destinationAddress, vehicleId, distance, durationMinutes, extras, tip, pickupTimestamp, simulationMode } = req.body;
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const parcelNature = resolveParcelNature(req.body || {});
    const deliveryPhone = resolveDeliveryPhone(req.body || {});
    const countryId = await resolveCountryId(req.body?.countryId || "");
    const pricing = await calculateDeliveryPricing({
      vehicleType: vehicleId,
      countryId,
      distanceKm: extractDistanceKm(distance),
      durationMinutes: parseNumber(durationMinutes) ?? 0,
      extras: parseNumber(extras) ?? 0,
      tip: parseNumber(tip) ?? 0,
      pickupTimestamp,
    });
    const newOrder = await Order.create({
      countryId,
      userId, pickupLocation, pickupAddress, destinationLocation, destinationAddress,
      price: pricing.price, distance, revenuePerDelivery: pricing.driverEarnings,
      platformCommission: pricing.platformCommission, serviceFee: pricing.serviceFee,
      completionOtp: generateCompletionOtp(), vehicleType: vehicleId, status: "PENDING",
      pricingSnapshotJson: JSON.stringify(pricing.snapshot),
      parcelNature,
      packageDescription: parcelNature,
    });
    const paymentRow = await Payment.create({ orderId: newOrder.get('id'), userId, amount: pricing.price, currency: "XOF", status: "PENDING", method: paymentMethod });
    await sendCompletionOtpSmsIfPossible({
      phone: deliveryPhone,
      otp: String(newOrder.get('completionOtp') || ''),
      parcelNature,
    });
    const io: Server = (req as any).io;
    if (!simulationMode) notifyNearbyDrivers(newOrder, io, pricing, paymentRow).catch(console.error);
    io.to('rides').emit('ride:created', newOrder);
    return res.status(201).json({ success: true, order: newOrder, payment: paymentRow, completionOtp: String(newOrder.get('completionOtp') || '') });
  } catch (error) {
    return res.status(500).json({ error: "Creation failed" });
  }
};

export const driverArrivedPickup = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    await order.update({ driverArrivedPickupAt: new Date(), status: "DRIVER_ARRIVED_PICKUP" });
    await notifyUserDeliveryStep(order, { title: "Livreur arrive", body: "Votre livreur est arrive.", type: "DRIVER_ARRIVED_PICKUP" });
    const io: Server = (req as any).io;
    io.to(`user_${order.get('userId')}`).emit("order_status_changed", { orderId, status: "DRIVER_ARRIVED_PICKUP", driverId: order.get('driverId') });
    return res.status(200).json({ success: true, data: order });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const driverLeftPickup = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    const waitingAt = order.get('driverArrivedPickupAt') as Date | null;
    const waiting = await calculateWaitingFees(waitingAt ?? new Date(), new Date(), String(order.get('countryId') || ""));
    await order.update({ status: "DRIVER_LEFT_PICKUP", driverLeftPickupAt: new Date(), waitingFee: waiting.waitingFee });
    await notifyUserDeliveryStep(order, { title: "Livraison demarree", body: "Le livreur a recupere le colis.", type: "DRIVER_LEFT_PICKUP" });
    const io: Server = (req as any).io;
    io.to(`user_${order.get('userId')}`).emit("order_status_changed", { orderId, status: "DRIVER_LEFT_PICKUP", driverId: order.get('driverId') });
    return res.status(200).json({ success: true, data: waiting });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const cancelDelivery = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order || order.get('status') === "COMPLETED") return res.status(400).json({ success: false });
    await order.update({ status: "CANCELLED", cancelledAt: new Date() });
    const driverId = order.get('driverId');
    if (driverId) await User.update({ isAvailable: true }, { where: { id: driverId } });
    const io: Server = (req as any).io;
    const payload = {
      orderId,
      status: "CANCELLED",
      driverId: String(driverId || ""),
      cancelledBy: "USER",
    };
    io.to(`user_${order.get('userId')}`).emit("order_status_changed", payload);
    io.to('drivers').emit('CANCEL_INCOMING_CALL', {
      orderId,
      requestId: orderId,
      cancelledBy: "USER",
    });
    if (driverId) {
      io.to(`user_${driverId}`).emit("order_status_changed", payload);
    }
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    const { userId, driverId, status, includeArchived, archived } = req.query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (driverId) where.driverId = driverId;
    if (status) where.status = status;
    const includeArchivedFlag =
      String(includeArchived || "").trim().toLowerCase() === "true" ||
      String(archived || "").trim().toLowerCase() === "all";
    if (!includeArchivedFlag) {
      where.isArchived = false;
    }

    const orders = await Order.findAll({ where, order: [["createdAt", "DESC"]] });

    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        const rawOrder = order.toJSON() as Record<string, unknown>;
        const currentDriverId = String(rawOrder.driverId || "").trim();

        try {
          const [payment, driver] = await Promise.all([
            Payment.findOne({
              where: { orderId: String(rawOrder.id || "") },
              order: [["createdAt", "DESC"]],
            }),
            currentDriverId
              ? User.findByPk(currentDriverId, {
                  attributes: ["id", "name", "phone", "rating", "photoUrl"],
                })
              : Promise.resolve(null),
          ]);

          return {
            ...rawOrder,
            paymentStatus: String(payment?.get("status") || rawOrder.paymentStatus || ""),
            payment_status: String(payment?.get("status") || rawOrder.payment_status || ""),
            paymentMethod: String(payment?.get("method") || rawOrder.paymentMethod || ""),
            payment_method: String(payment?.get("method") || rawOrder.payment_method || ""),
            payment: payment
              ? {
                  id: String(payment.get("id") || ""),
                  status: String(payment.get("status") || ""),
                  method: String(payment.get("method") || ""),
                  amount: Number(payment.get("amount") || 0),
                  currency: String(payment.get("currency") || ""),
                  paidAt: payment.get("paidAt") || null,
                }
              : null,
            driver: driver
              ? {
                  id: String(driver.get("id") || ""),
                  name: String(driver.get("name") || ""),
                  phone: String(driver.get("phone") || ""),
                  rating: Number(driver.get("rating") || 0),
                  photoUrl: String(driver.get("photoUrl") || ""),
                }
              : null,
          };
        } catch (enrichmentError) {
          console.error("getOrders enrichment failed", enrichmentError);
          return rawOrder;
        }
      })
    );

    return res.status(200).json(enrichedOrders);
  } catch (error) { return res.status(500).json({ error: "Failed" }); }
};

export const archiveOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    await order.update({ isArchived: true });
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    await order.destroy();
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const bulkDeleteOrders = async (req: Request, res: Response) => {
  try {
    const { orderIds } = req.body;
    await Order.destroy({ where: { id: { [Op.in]: orderIds } } });
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId, completionOtp } = req.body;
    const status = normalizeDeliveryStatus(req.body?.status);
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ message: "Commande non trouvée" });
    if (status === 'ACCEPTED' && order.get('status') !== 'PENDING') return res.status(400).json({ success: false, message: "Déjà acceptée par un autre livreur" });
    const updateData: any = { status };
    if (driverId) updateData.driverId = driverId;
    if (status === "ACCEPTED" && driverId) {
      const activeVehicle = await DriverVehicle.findOne({ where: { driverId, isPrimary: true }, order: [["createdAt", "DESC"]] });
      if (activeVehicle) updateData.driverVehicleId = activeVehicle.get("id");
      await User.update({ isAvailable: false }, { where: { id: driverId } });
    }
    if (status === "COMPLETED") {
      const providedOtp = normalizeOtp(completionOtp);
      const storedOtp = normalizeOtp(order.get("completionOtp"));
      if (providedOtp !== storedOtp) return res.status(400).json({ success: false, message: "Code OTP invalide" });
      updateData.completionOtpValidatedAt = new Date();
      const currentDriverId = order.get('driverId');
      if (currentDriverId) await User.update({ isAvailable: true }, { where: { id: currentDriverId } });
    }
    await Order.update(updateData, { where: { id: orderId } });
    const { paymentMethod, paymentStatus } = await getOrderPaymentSnapshot(orderId);
    const io: Server = (req as any).io;
    const payload = { orderId, status, driverId: driverId || order.get('driverId'), payment_method: paymentMethod, payment_status: paymentStatus };
    io.to(`user_${order.get('userId')}`).emit('order_status_changed', payload);
    if (status === 'ACCEPTED') io.to('drivers').emit('CANCEL_INCOMING_CALL', {
      orderId,
      requestId: orderId,
      acceptedByDriverId: String(driverId || order.get('driverId') || ''),
    });
    if (status === "COMPLETED") await notifyUserDeliveryStep(order, { title: "Livraison terminee", body: "Merci!", type: "ORDER_COMPLETED" });
    if (status === "ACCEPTED") {
      await notifyUserDeliveryStep(order, {
        title: "Livreur trouvé",
        body: "Un livreur a accepté votre commande, suivez-le sur la carte.",
        type: "DRIVER_ACCEPTED",
        route: "/app",
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ error: "Update failed" }); }
};

export const submitOrderRating = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;
    const { orderId } = req.params;
    const rating = normalizeRatingValue(req.body?.rating ?? req.body?.note);
    const comment = String(req.body?.comment ?? req.body?.review ?? "").trim();

    if (!requesterId || !requesterRole) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (rating == null) {
      return res.status(400).json({
        success: false,
        message: "La note doit etre un nombre compris entre 1 et 5",
      });
    }

    const result = await sequelize.transaction(async (transaction) => {
      const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) {
        return { status: 404, body: { success: false, message: "Course introuvable" } };
      }

      if (String(order.get("status") || "") !== "COMPLETED") {
        return {
          status: 400,
          body: { success: false, message: "La note ne peut etre soumise qu'apres une course terminee" },
        };
      }

      const orderOwnerId = String(order.get("userId") || "").trim();
      const driverId = String(order.get("driverId") || "").trim();

      if (requesterRole === "livreur") {
        if (driverId !== requesterId) {
          return {
            status: 403,
            body: { success: false, message: "Vous ne pouvez noter que les clients de vos propres courses" },
          };
        }

        if (order.get("userRating") != null) {
          return {
            status: 409,
            body: {
              success: false,
              message: "Cette course a deja ete notee",
              data: {
                orderId: String(order.get("id") || ""),
                rating: Number(order.get("userRating")),
                comment: String(order.get("userRatingComment") || ""),
                ratedAt: order.get("userRatedAt"),
              },
            },
          };
        }

        if (!orderOwnerId) {
          return {
            status: 400,
            body: { success: false, message: "Aucun client n'est associe a cette course" },
          };
        }

        const user = await User.findByPk(orderOwnerId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) {
          return { status: 404, body: { success: false, message: "Client introuvable" } };
        }

        const currentRating = Number(user.get("rating") || 0);
        const currentRatingCount = Number(user.get("ratingCount") || 0);
        const nextRatingCount = currentRatingCount + 1;
        const nextRating =
          Math.round((((currentRating * currentRatingCount) + rating) / nextRatingCount) * 100) / 100;
        const ratedAt = new Date();

        await order.update(
          {
            userRating: rating,
            userRatingComment: comment || null,
            userRatedAt: ratedAt,
            ratedByDriverId: requesterId,
          },
          { transaction }
        );

        await user.update(
          {
            rating: nextRating,
            ratingCount: nextRatingCount,
          },
          { transaction }
        );

        return {
          status: 200,
          body: {
            success: true,
            message: "Note enregistree avec succes",
            data: {
              orderId: String(order.get("id") || ""),
              userId: orderOwnerId,
              submittedRating: rating,
              comment,
              ratedAt,
              userRating: nextRating,
              userRatingCount: nextRatingCount,
            },
          },
        };
      }

      if (requesterRole !== "admin" && orderOwnerId !== requesterId) {
        return {
          status: 403,
          body: { success: false, message: "Vous ne pouvez noter que vos propres courses" },
        };
      }

      if (order.get("driverRating") != null) {
        return {
          status: 409,
          body: {
            success: false,
            message: "Cette course a deja ete notee",
            data: {
              orderId: String(order.get("id") || ""),
              rating: Number(order.get("driverRating")),
              comment: String(order.get("driverRatingComment") || ""),
              ratedAt: order.get("driverRatedAt"),
            },
          },
        };
      }

      if (!driverId) {
        return {
          status: 400,
          body: { success: false, message: "Aucun livreur n'est associe a cette course" },
        };
      }

      const driver = await User.findByPk(driverId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!driver) {
        return { status: 404, body: { success: false, message: "Livreur introuvable" } };
      }

      const currentRating = Number(driver.get("rating") || 0);
      const currentRatingCount = Number(driver.get("ratingCount") || 0);
      const nextRatingCount = currentRatingCount + 1;
      const nextRating =
        Math.round((((currentRating * currentRatingCount) + rating) / nextRatingCount) * 100) / 100;
      const ratedAt = new Date();

      await order.update(
        {
          driverRating: rating,
          driverRatingComment: comment || null,
          driverRatedAt: ratedAt,
          ratedByUserId: requesterId,
        },
        { transaction }
      );

      await driver.update(
        {
          rating: nextRating,
          ratingCount: nextRatingCount,
        },
        { transaction }
      );

      return {
        status: 200,
        body: {
          success: true,
          message: "Note enregistree avec succes",
          data: {
            orderId: String(order.get("id") || ""),
            driverId,
            submittedRating: rating,
            comment,
            ratedAt,
            driverRating: nextRating,
            driverRatingCount: nextRatingCount,
          },
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({ success: false, message: "Erreur lors de l'enregistrement de la note" });
  }
};

export const createDeliveryRequest = async (req: Request, res: Response) => {
  try {
    const { userId, pickupLocation, pickupAddress, destinationLocation, destinationAddress, distance, vehicleType } = req.body;
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const parcelNature = resolveParcelNature(req.body || {});
    const deliveryPhone = resolveDeliveryPhone(req.body || {});
    const countryId = await resolveCountryId("");
    const pricing = await calculateDeliveryPricing({ vehicleType, countryId, distanceKm: extractDistanceKm(distance), durationMinutes: 0, extras: 0, tip: 0 });
    const newOrder = await Order.create({ countryId, userId, pickupLocation, pickupAddress, destinationLocation, destinationAddress, price: pricing.price, distance: String(distance || ""), status: "PENDING", vehicleType, completionOtp: generateCompletionOtp(), parcelNature, packageDescription: parcelNature });
    const paymentRow = await Payment.create({ orderId: newOrder.get('id'), userId, amount: pricing.price, status: "PENDING", method: paymentMethod });
    await sendCompletionOtpSmsIfPossible({
      phone: deliveryPhone,
      otp: String(newOrder.get('completionOtp') || ''),
      parcelNature,
    });
    const io: Server = (req as any).io;
    notifyNearbyDrivers(newOrder, io, pricing, paymentRow).catch(console.error);
    return res.status(201).json({ success: true, order: newOrder });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const assignNearestDriver = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    const availableDrivers = await User.findAll({ where: { role: 'livreur', isActive: true, isAvailable: true }, raw: true });
    if (!availableDrivers.length) return res.status(404).json({ success: false });
    const selected = availableDrivers[0] as any;
    await Order.update({ driverId: selected.id, status: "ACCEPTED" }, { where: { id: orderId } });
    await User.update({ isAvailable: false }, { where: { id: selected.id } });

    let vehicle = null;
    try {
      vehicle = await DriverVehicle.findOne({ where: { driverId: selected.id }, raw: true });
    } catch (e) { }

    return res.status(200).json({
      success: true,
      data: {
        driver: {
          id: selected.id,
          name: selected.name,
          phone: selected.phone,
          latitude: selected.latitude,
          longitude: selected.longitude,
          photoUrl: selected.photoUrl,
          coursesCount: selected.deliveryCount || 0,
          fcmToken: selected.fcmToken,
        },
        vehicle: vehicle || {},
        completionOtp: order.get('completionOtp')
      }
    });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const acceptDeliveryByDriver = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;

    // Sécurisation : on met à jour SEULEMENT si la course est toujours en attente
    const [affectedCount] = await Order.update(
      { driverId, status: "ACCEPTED" },
      { where: { id: orderId, status: "PENDING" } }
    );

    if (affectedCount === 0) {
      return res.status(400).json({ success: false, message: "Course déjà assignée ou annulée." });
    }

    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });

    await User.update({ isAvailable: false }, { where: { id: driverId } });
    const driver: any = await User.findByPk(driverId, { raw: true });

    let vehicle = null;
    try {
      vehicle = await DriverVehicle.findOne({ where: { driverId }, raw: true });
    } catch (e) { }

    const io: Server = (req as any).io;
    const userId = order.get('userId');

    io.to(`user_${userId}`).emit("order_status_changed", {
      orderId,
      status: "ACCEPTED",
      driverId,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        latitude: driver.latitude,
        longitude: driver.longitude,
        photoUrl: driver.photoUrl,
        coursesCount: driver.deliveryCount || 0,
        fcmToken: driver.fcmToken,
      },
      vehicle: vehicle || {},
      completionOtp: order.get('completionOtp'),
      payment_method: String((await getOrderPaymentSnapshot(orderId)).paymentMethod || "CASH"),
    });
    io.to('drivers').emit('CANCEL_INCOMING_CALL', {
      orderId,
      requestId: orderId,
      acceptedByDriverId: String(driverId || ''),
    });

    await notifyUserDeliveryStep(order, {
      title: "Livreur trouvé",
      body: "Votre chauffeur a accepté la course et se dirige vers vous.",
      type: "DRIVER_ACCEPTED",
      route: "/app",
    });

    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    await Order.update({ status }, { where: { id: orderId } });
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const updateDriverLocationForDelivery = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId, latitude, longitude } = req.body;
    await User.update({ latitude, longitude }, { where: { id: driverId } });
    const io: Server = (req as any).io;
    io.to(`user_${orderId}`).emit("driver_location_updated", { orderId, driverId, latitude, longitude });
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const getDeliveryTracking = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId, { raw: true });
    let driver = null;
    if (order?.driverId) driver = await User.findByPk(order.driverId, { raw: true });
    return res.status(200).json({ success: true, data: { order, driver } });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const estimateCancellation = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Commande non trouvée" });

    const fees = await calculateCancellationFees({
      orderId: String(order.get('id')),
      driverArrivedAt: order.get('driverArrivedPickupAt') as Date | null,
      cancelledAt: new Date(),
      countryId: String(order.get('countryId') || ""),
    });
    return res.status(200).json({ success: true, data: fees });
  } catch (error) { return res.status(500).json({ success: false }); }
};

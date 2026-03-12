import { Request, Response } from 'express';
import { sendNotificationToDriver } from '../../services/notification.service';
import { Server } from 'socket.io';
import User from '../../models/user.model';
import { Op } from 'sequelize';
import Order from '../../models/order.model';
import UserAddress from '../../models/user-address.model';
import DriverVehicle from "../../models/driver-vehicle.model";
import DriverDocument from "../../models/driver-document.model";
import Payment from "../../models/payment.model";
import { isFedaPayConfigured } from "../../services/fedapay.service";
import { calculateDeliveryPricing, calculateWaitingFees } from "../../services/pricing.service";
import { calculateCancellationFees } from "../../services/cancellation.service";

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

function generateCompletionOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeOtp(value: unknown): string {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function parseLatLng(raw?: string): { lat: number; lng: number } | null {
  if (!raw) return null;
  const [latText, lngText] = raw.split(",").map((v) => v.trim());
  const lat = Number(latText);
  const lng = Number(lngText);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function distanceSquared(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
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

type AddressUsageCandidate = {
  location?: unknown;
  address?: unknown;
};

async function touchRecentlyUsedAddresses(
  userId: unknown,
  candidates: AddressUsageCandidate[]
) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return;

  const rows = await UserAddress.findAll({
    where: { userId: normalizedUserId },
  });
  if (!rows.length) return;

  const touchedIds = new Set<string>();

  for (const candidate of candidates) {
    const parsedLocation = parseLatLng(
      typeof candidate.location === "string" ? candidate.location : undefined
    );
    const normalizedAddress = String(candidate.address || "").trim().toLowerCase();

    const match = rows.find((row) => {
      const rowId = String(row.get("id"));
      if (touchedIds.has(rowId)) return false;

      const rowLat = Number(row.get("latitude"));
      const rowLng = Number(row.get("longitude"));
      const rowMapLabel = String(row.get("mapLabel") || "").trim().toLowerCase();

      if (parsedLocation) {
        const sameLat = Math.abs(rowLat - parsedLocation.lat) < 0.00001;
        const sameLng = Math.abs(rowLng - parsedLocation.lng) < 0.00001;
        if (sameLat && sameLng) return true;
      }

      return normalizedAddress.length > 0 && rowMapLabel === normalizedAddress;
    });

    if (!match) continue;
    touchedIds.add(String(match.get("id")));
    await match.update({ updatedAt: new Date() });
  }
}

export const createOrder = async (req: Request, res: Response) => {
  try {
    const {
      fcmToken,
      userId,
      pickupLocation,
      destinationLocation,
      pickupAddress,
      destinationAddress,
      vehicleId,
      distance,
      durationMinutes,
      extras,
      tip,
      pickupTimestamp,
    } = req.body;
    const normalizedUserId = String(userId || "").trim();
    const normalizedPickupLocation = String(pickupLocation || "").trim();
    const normalizedDestinationLocation = String(destinationLocation || "").trim();
    const normalizedPickupAddress = String(pickupAddress || "").trim();
    const normalizedDestinationAddress = String(destinationAddress || "").trim();
    const normalizedVehicleId = String(vehicleId || "").trim();
    const normalizedDistance = String(distance || "").trim();

    if (
      !normalizedUserId ||
      !normalizedPickupLocation ||
      !normalizedDestinationLocation ||
      !normalizedPickupAddress ||
      !normalizedDestinationAddress ||
      !normalizedVehicleId ||
      !normalizedDistance
    ) {
      return res.status(400).json({
        error: "Parametres de commande invalides",
        details:
          "userId, pickupLocation, destinationLocation, pickupAddress, destinationAddress, vehicleId et distance sont requis.",
      });
    }

    const targetUser = await User.findByPk(normalizedUserId);
    if (!targetUser) {
      return res.status(400).json({
        error: "Utilisateur introuvable",
        details: `Aucun usager trouve pour userId=${normalizedUserId}`,
      });
    }

    const parsedDistanceKm = extractDistanceKm(normalizedDistance);
    const parsedDuration = parseNumber(durationMinutes) ?? 0;
    const extrasValue = parseNumber(extras) ?? 0;
    const tipValue = parseNumber(tip) ?? 0;

    const pricing = await calculateDeliveryPricing({
      vehicleType: normalizedVehicleId,
      distanceKm: parsedDistanceKm,
      durationMinutes: parsedDuration,
      extras: extrasValue,
      tip: tipValue,
      pickupTimestamp,
    });

    const completionOtp = generateCompletionOtp();

    const newOrder = await Order.create({
      userId: normalizedUserId,
      pickupLocation: normalizedPickupLocation,
      pickupAddress: normalizedPickupAddress,
      destinationLocation: normalizedDestinationLocation,
      destinationAddress: normalizedDestinationAddress,
      price: pricing.price,
      distance: normalizedDistance,
      revenuePerDelivery: pricing.driverEarnings,
      platformCommission: pricing.platformCommission,
      serviceFee: pricing.serviceFee,
      completionOtp,
      vehicleType: normalizedVehicleId,
      status: "PENDING",
      peakSurcharge: pricing.peakSurcharge,
      nightSurcharge: pricing.nightSurcharge,
      earlyMorningSurcharge: pricing.earlyMorningSurcharge,
      pricingSnapshotJson: JSON.stringify(pricing.snapshot),
    });

    let paymentRow: Payment | null = null;
    if (isFedaPayConfigured()) {
      paymentRow = await Payment.create({
        orderId: String(newOrder.get("id")),
        userId: normalizedUserId,
        driverId: null,
        amount: pricing.price,
        currency: "XOF",
        status: "PENDING",
        method: "MOBILE_MONEY",
        provider: "FEDAPAY",
        customerEmail: String(targetUser.get("email") || "").trim() || null,
        customerPhone: String(targetUser.get("phone") || "").trim() || null,
      });
    }

    await touchRecentlyUsedAddresses(normalizedUserId, [
      { location: normalizedPickupLocation, address: normalizedPickupAddress },
      { location: normalizedDestinationLocation, address: normalizedDestinationAddress },
    ]);

    const io: Server = (req as any).io;
    io.to('drivers').emit('new_ride_request', {
      orderId: newOrder.id,
      pickupAddress: normalizedPickupLocation,
      deliveryAddress: normalizedDestinationLocation,
      price: pricing.price,
      distance: normalizedDistance,
      vehicleType: normalizedVehicleId,
      timestamp: new Date(),
    });
    io.to('rides').emit('ride:created', newOrder);

    console.log(`reponse commande ${newOrder.id} recue pour ${vehicleId} a ${pricing.price} FCFA`);
    return res.status(201).json({
      success: true,
      message: "Recherche de livreur lancée",
      order: newOrder,
      paymentUrl: null,
      payment: paymentRow
        ? {
          id: paymentRow.get("id"),
          status: paymentRow.get("status"),
          provider: paymentRow.get("provider"),
          checkoutUrl: null,
        }
        : null,
      data: {
        order: newOrder,
        completionOtp,
        paymentUrl: null,
      },
    });
  } catch (error) {
    console.error("createOrder error", error);
    return res.status(500).json({
      error: "Erreur lors de la creation de la commande",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

export const driverArrivedPickup = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status === "CANCELLED" || order.status === "COMPLETED") {
      return res.status(400).json({ success: false, message: "Order can not be updated in its current status" });
    }

    const now = new Date();
    await order.update({
      driverArrivedPickupAt: now,
      status: "DRIVER_ARRIVED_PICKUP",
    });

    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit("order_status_changed", {
      orderId,
      status: "DRIVER_ARRIVED_PICKUP",
      driverId: order.driverId,
    });

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to mark arrival" });
  }
};

export const driverLeftPickup = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const arrival = order.get("driverArrivedPickupAt") as Date | null;
    const now = new Date();
    const waiting = await calculateWaitingFees(arrival ?? now, now);

    await order.update({
      driverLeftPickupAt: now,
      waitingDurationSeconds: waiting.waitingDurationSeconds,
      waitingBillableSeconds: waiting.waitingBillableSeconds,
      waitingFee: waiting.waitingFee,
      status: "DRIVER_LEFT_PICKUP",
    });

    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit("order_status_changed", {
      orderId,
      status: "DRIVER_LEFT_PICKUP",
      driverId: order.driverId,
    });

    return res.status(200).json({ success: true, data: waiting });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to mark departure" });
  }
};

export const cancelDelivery = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { cancelledBy = "usager" } = req.body || {};
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status === "COMPLETED") {
      return res.status(400).json({ success: false, message: "Cannot cancel a completed order" });
    }

    const cancellationAt = new Date();
    const driverArrivedAt = order.get("driverArrivedPickupAt") as Date | null;
    const fees = await calculateCancellationFees({
      orderId,
      driverArrivedAt,
      cancelledAt: cancellationAt,
    });

    await order.update({
      status: "CANCELLED",
      cancelledAt: cancellationAt,
      cancelledBy,
      cancellationFee: fees.cancellationFee,
      waitingDurationSeconds: fees.waitingDurationSeconds,
      waitingFee: fees.waitingFee,
      waitingBillableSeconds: fees.waitingBillableSeconds,
      platformCommission: (order.platformCommission || 0) + fees.platformShare,
    });

    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit("order_status_changed", {
      orderId,
      status: "CANCELLED",
      driverId: order.driverId,
    });

    return res.status(200).json({ success: true, data: fees });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to cancel order" });
  }
};

export const estimateCancellation = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const now = new Date();
    const driverArrivedAt = order.get("driverArrivedPickupAt") as Date | null;
    const estimate = await calculateCancellationFees({
      orderId,
      driverArrivedAt,
      cancelledAt: now,
    });
    return res.status(200).json({ success: true, data: estimate });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to estimate cancellation" });
  }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    // const { role, userId } = req.query; // On peut filtrer par utilisateur ou statut

    // const whereClause: any = {};
    // if (userId) whereClause.userId = userId;
    // if (req.query.status) whereClause.status = req.query.status;

    const { archived, userId, driverId, status } = req.query as Record<string, string | undefined>;
    const archivedValue = archived === "true";
    const whereClause: Record<string, unknown> = { isArchived: archivedValue };
    if (userId) whereClause.userId = userId;
    if (driverId) whereClause.driverId = driverId;
    if (status) whereClause.status = status;
    const orders = await Order.findAll({
      where: whereClause,
      attributes: {
        exclude: ["completionOtp", "completionOtpValidatedAt"],
      },
      include: [
        {
          model: User,
          as: "driver",
          attributes: ["id", "name", "phone"],
          required: false,
        },
        {
          model: Payment,
          as: "payments",
          attributes: [
            "id",
            "amount",
            "currency",
            "status",
            "method",
            "provider",
            "checkoutUrl",
            "paidAt",
            "createdAt",
          ],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json(orders);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lors de la rÃƒÂ©cupÃƒÂ©ration" });
  }
};

export const archiveOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found", data: {} });
    }

    if (order.isArchived) {
      return res.status(200).json({
        success: true,
        message: "Order already archived",
        data: { orderId: order.id, isArchived: true },
      });
    }

    if (order.driverId && order.status === "ACCEPTED") {
      await User.update({ isAvailable: true }, { where: { id: order.driverId } });
    }

    await order.update({
      isArchived: true,
      status: order.status === "ACCEPTED" ? "CANCELLED" : order.status,
    });

    const io = (req as any).io;
    io.to(`user_${order.userId}`).emit("order_archived", { orderId: order.id });
    if (order.driverId) {
      io.to(`user_${order.driverId}`).emit("order_archived", { orderId: order.id });
    }
    io.to('rides').emit('ride:updated', order);

    return res.status(200).json({
      success: true,
      message: "Order archived",
      data: { orderId: order.id, isArchived: true },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to archive order", data: {} });
  }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found", data: {} });
    }

    if (order.driverId && order.status === "ACCEPTED") {
      await User.update({ isAvailable: true }, { where: { id: order.driverId } });
    }

    const userId = order.userId;
    const driverId = order.driverId;

    await order.destroy();

    const io = (req as any).io;
    io.to(`user_${userId}`).emit("order_deleted", { orderId });
    if (driverId) {
      io.to(`user_${driverId}`).emit("order_deleted", { orderId });
    }
    io.to('rides').emit('ride:deleted', { orderId });

    return res.status(200).json({
      success: true,
      message: "Order deleted",
      data: { orderId },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to delete order", data: {} });
  }
};

export const bulkDeleteOrders = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.orderIds;
    const orderIds = Array.isArray(payload)
      ? Array.from(
        new Set(
          payload
            .map((item: unknown) => String(item || "").trim())
            .filter((id: string) => id.length > 0)
        )
      )
      : [];

    if (!orderIds.length) {
      return res.status(400).json({
        success: false,
        message: "orderIds must be a non-empty array",
        data: {},
      });
    }

    const orders = await Order.findAll({
      where: { id: { [Op.in]: orderIds } },
      attributes: ["id", "userId", "driverId", "status"],
      raw: true,
    });

    if (!orders.length) {
      return res.status(404).json({ success: false, message: "No orders found", data: {} });
    }

    const foundIds = new Set(orders.map((o: any) => String(o.id)));
    const notFoundIds = orderIds.filter((id: string) => !foundIds.has(id));

    const releasableDriverIds = Array.from(
      new Set(
        orders
          .filter((o: any) => o.status === "ACCEPTED" && o.driverId)
          .map((o: any) => String(o.driverId))
      )
    );

    const deletedCount = await Order.destroy({
      where: { id: { [Op.in]: Array.from(foundIds) } },
    });

    if (releasableDriverIds.length) {
      await User.update({ isAvailable: true }, { where: { id: { [Op.in]: releasableDriverIds } } });
    }

    const io: Server = (req as any).io;
    orders.forEach((order: any) => {
      io.to(`user_${order.userId}`).emit("order_deleted", { orderId: order.id });
      if (order.driverId) {
        io.to(`user_${order.driverId}`).emit("order_deleted", { orderId: order.id });
      }
    });
    io.to('rides').emit('rides:bulk_deleted', { orderIds: orders.map((o: any) => o.id) });

    return res.status(200).json({
      success: true,
      message: "Orders deleted",
      data: {
        deletedCount,
        deletedIds: Array.from(foundIds),
        notFoundIds,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to bulk delete orders", data: {} });
  }
};



export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, driverId, completionOtp } = req.body;
    // status peut ÃƒÂªtre : 'ACCEPTED', 'CANCELLED', 'COMPLETED'

    console.log({ orderId }, { status }, { driverId });
    // 1. VÃƒÂ©rifier si la commande existe
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ message: "Commande non trouvÃƒÂ©e" });
    }

    // // 2. SÃƒÂ©curitÃƒÂ© : Si un livreur accepte, vÃƒÂ©rifier qu'elle n'est pas dÃƒÂ©jÃƒÂ  prise
    // if (status === 'ACCEPTED' && order.status !== 'PENDING') {
    //   return res.status(400).json({ message: "Cette commande a dÃƒÂ©jÃƒÂ  ÃƒÂ©tÃƒÂ© acceptÃƒÂ©e par un autre livreur" });
    // }

    // 3. Mise ÃƒÂ  jour
    const updateData: any = { status };
    if (driverId) updateData.driverId = driverId;

    if (status === "ACCEPTED" && driverId) {
      const activeVehicle = await DriverVehicle.findOne({
        where: { driverId, isPrimary: true },
        order: [["createdAt", "DESC"]],
      });
      if (activeVehicle) updateData.driverVehicleId = activeVehicle.get("id");
    }

    if (status === "COMPLETED") {
      if (!order.driverId || order.status === "PENDING") {
        return res.status(400).json({
          success: false,
          message: "La course doit etre acceptee avant validation OTP",
        });
      }
      const providedOtp = normalizeOtp(completionOtp);
      const storedOtp = normalizeOtp(order.get("completionOtp"));
      if (!providedOtp) {
        return res.status(400).json({
          success: false,
          message: "Le code OTP est requis pour terminer la course",
        });
      }
      if (providedOtp !== storedOtp) {
        return res.status(400).json({
          success: false,
          message: "Code OTP invalide",
        });
      }
      updateData.completionOtpValidatedAt = new Date();
      if (order.driverId) {
        await User.update({ isAvailable: true }, { where: { id: order.driverId } });
      }
    }

    await Order.update(updateData, {
      where: { id: orderId }
    });
    console.log("socket emit to order_status_changed 1 ");
    // 4. (Optionnel) Notifier le client via Socket.io que sa commande est acceptÃƒÂ©e
    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit('order_status_changed', {
      orderId,
      status,
      driverId: driverId || order.driverId
    });
    io.to('rides').emit('ride:updated', { id: orderId, status, driverId: driverId || order.driverId });

    console.log("socket emit to order_status_changed 2 ");
    return res.status(200).json({
      success: true,
      message: `Commande mise ÃƒÂ  jour : ${status}`
    });

  } catch (error) {
    return res.status(500).json({ error: "Erreur lors de la mise ÃƒÂ  jour" });
  }
};

export const createDeliveryRequest = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      pickupLocation,
      pickupAddress,
      destinationLocation,
      destinationAddress,
      price,
      distance,
      vehicleType,
      revenuePerDelivery,
    } = req.body;

    if (!userId || !pickupLocation || !destinationLocation || !pickupAddress || !destinationAddress || !vehicleType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        data: {},
      });
    }

    const parsedDistanceKm = extractDistanceKm(distance);
    const pricing = await calculateDeliveryPricing({
      vehicleType,
      distanceKm: parsedDistanceKm,
      durationMinutes: 0,
      extras: 0,
      tip: 0,
    });
    const completionOtp = generateCompletionOtp();

    const newOrder = await Order.create({
      userId,
      pickupLocation,
      pickupAddress,
      destinationLocation,
      destinationAddress,
      price: pricing.price,
      distance: String(distance || ""),
      revenuePerDelivery: pricing.driverEarnings,
      platformCommission: pricing.platformCommission,
      serviceFee: pricing.serviceFee,
      peakSurcharge: pricing.peakSurcharge,
      nightSurcharge: pricing.nightSurcharge,
      earlyMorningSurcharge: pricing.earlyMorningSurcharge,
      pricingSnapshotJson: JSON.stringify(pricing.snapshot),
      completionOtp,
      vehicleType,
      status: "PENDING",
    });

    await touchRecentlyUsedAddresses(userId, [
      { location: pickupLocation, address: pickupAddress },
      { location: destinationLocation, address: destinationAddress },
    ]);

    const io: Server = (req as any).io;
    io.to("drivers").emit("new_delivery_request", {
      orderId: newOrder.id,
      pickupAddress,
      destinationAddress,
      price: newOrder.price,
      distance: newOrder.distance,
      vehicleType: newOrder.vehicleType,
    });
    io.to('rides').emit('ride:created', newOrder);

    return res.status(201).json({
      success: true,
      message: "Delivery request created",
      data: {
        order: newOrder,
        completionOtp,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create delivery request",
      data: {},
    });
  }
};

export const assignNearestDriver = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const preferredDriverId = String(req.body?.preferredDriverId || req.body?.driverId || "").trim();
    const order = await Order.findByPk(orderId, { raw: true });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found", data: {} });
    }
    let availableDrivers = await User.findAll({
      where: {
        role: { [Op.in]: ["livreur", "driver"] },
      },
      attributes: ["id", "latitude", "longitude", "name", "phone", "fcmToken"],
      raw: true,
    });

    if (!availableDrivers.length) {
      availableDrivers = await User.findAll({
        attributes: ["id", "latitude", "longitude", "name", "phone", "fcmToken", "role"],
        raw: true,
      });
    }

    if (!availableDrivers.length) {
      return res.status(404).json({
        success: false,
        message: "No driver found in database",
        data: { driversFound: 0, sampleDriver: null },
      });
    }

    // Ancienne logique (plus proche livreur) conservÃƒÂ©e en commentaire:
    // const pickup = parseLatLng(order.pickupLocation);
    // let selected = availableDrivers[0];
    // if (pickup) {
    //   const withCoords = availableDrivers.filter((d: any) => d.latitude !== null && d.longitude !== null);
    //   if (withCoords.length) {
    //     selected = withCoords.sort((a: any, b: any) => {
    //       const da = distanceSquared(pickup, { lat: Number(a.latitude), lng: Number(a.longitude) });
    //       const db = distanceSquared(pickup, { lat: Number(b.latitude), lng: Number(b.longitude) });
    //       return da - db;
    //     })[0];
    //   }
    // }

    let selected: any = null;
    if (preferredDriverId) {
      selected = availableDrivers.find((d: any) => String(d.id) === preferredDriverId) || null;
    }

    if (!selected) {
      const pickup = parseLatLng((order as any).pickupLocation);
      if (pickup) {
        const withCoords = availableDrivers.filter(
          (d: any) => d.latitude !== null && d.longitude !== null
        );
        if (withCoords.length) {
          selected = withCoords.sort((a: any, b: any) => {
            const da = distanceSquared(pickup, { lat: Number(a.latitude), lng: Number(a.longitude) });
            const db = distanceSquared(pickup, { lat: Number(b.latitude), lng: Number(b.longitude) });
            return da - db;
          })[0];
        }
      }
    }

    if (!selected) {
      selected = availableDrivers[0];
    }

    const selectedDriverId = (selected as any).id;
    const activeVehicle = await DriverVehicle.findOne({
      where: { driverId: selectedDriverId, isPrimary: true },
      order: [["createdAt", "DESC"]],
      raw: true,
    });
    const idPhoto = await DriverDocument.findOne({
      where: { userId: selectedDriverId, type: "ID_PHOTO" },
      order: [["createdAt", "DESC"]],
      raw: true,
    });
    const coursesCount = await Order.count({
      where: { driverId: selectedDriverId, status: "COMPLETED" },
    });

    await Order.update(
      {
        driverId: selectedDriverId,
        driverVehicleId: activeVehicle ? (activeVehicle as any).id : null,
        status: "ACCEPTED",
      },
      { where: { id: orderId } }
    );
    await User.update({ isAvailable: false }, { where: { id: selectedDriverId } });

    const selectedDriverToken = ((selected as any).fcmToken ?? "").toString().trim();
    if (selectedDriverToken && selectedDriverToken !== "undefined" && selectedDriverToken !== "null") {
      await sendNotificationToDriver(
        selectedDriverToken,
        "Nouvelle commande",
        "Une nouvelle course vous est attribuÃ©e.",
        {
          type: "NEW_ORDER",
          orderId: String(orderId),
          pickupAddress: String((order as any).pickupAddress || ""),
          destinationAddress: String((order as any).destinationAddress || ""),
          price: String((order as any).price ?? ""),
          distance: String((order as any).distance ?? ""),
          vehicleType: String((order as any).vehicleType ?? ""),
        }
      );
    }

    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit("order_status_changed", {
      orderId,
      status: "ACCEPTED",
      driverId: selectedDriverId,
      completionOtp: String((order as any).completionOtp || ""),
    });
    io.to('rides').emit('ride:updated', { id: orderId, status: "ACCEPTED", driverId: selectedDriverId });

    return res.status(200).json({
      success: true,
      message: "Driver assigned",
      data: {
        driversFound: availableDrivers.length,
        sampleDriver: availableDrivers[0],
        orderId,
        driver: {
          id: selectedDriverId,
          name: (selected as any).name || "Livreur",
          phone: (selected as any).phone || "",
          latitude: Number((selected as any).latitude ?? 0),
          longitude: Number((selected as any).longitude ?? 0),
          photoUrl: idPhoto?.url || null,
          coursesCount,
        },
        vehicle: activeVehicle
          ? {
            type: activeVehicle.type || "",
            brand: activeVehicle.brand || "",
            model: activeVehicle.model || "",
            plateNumber: activeVehicle.plateNumber || "",
            year: activeVehicle.year || null,
          }
          : null,
        completionOtp: String((order as any).completionOtp || ""),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to assign driver", data: {} });
  }
};

export const acceptDeliveryByDriver = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({ success: false, message: "driverId is required", data: {} });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found", data: {} });
    }

    if (order.status !== "PENDING" && order.status !== "ACCEPTED") {
      return res.status(400).json({ success: false, message: "Order cannot be accepted", data: {} });
    }

    const activeVehicle = await DriverVehicle.findOne({
      where: { driverId, isPrimary: true },
      order: [["createdAt", "DESC"]],
    });

    await Order.update(
      {
        driverId,
        status: "ACCEPTED",
        driverVehicleId: activeVehicle ? activeVehicle.get("id") : null,
      },
      { where: { id: orderId } }
    );
    await User.update({ isAvailable: false }, { where: { id: driverId } });

    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit("order_status_changed", {
      orderId,
      status: "ACCEPTED",
      driverId,
      completionOtp: String(order.get("completionOtp") || ""),
    });
    io.to('rides').emit('ride:updated', { id: orderId, status: "ACCEPTED", driverId });

    return res.status(200).json({
      success: true,
      message: "Delivery accepted",
      data: {
        orderId,
        driverId,
        status: "ACCEPTED",
        completionOtp: String(order.get("completionOtp") || ""),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to accept delivery", data: {} });
  }
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status, completionOtp } = req.body as {
      status: typeof DELIVERY_STATUSES[number];
      completionOtp?: string;
    };

    if (!status || !DELIVERY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status", data: {} });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found", data: {} });
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "COMPLETED") {
      if (!order.driverId || order.status === "PENDING") {
        return res.status(400).json({
          success: false,
          message: "La course doit etre acceptee avant validation OTP",
          data: {},
        });
      }
      const providedOtp = normalizeOtp(completionOtp);
      const storedOtp = normalizeOtp(order.get("completionOtp"));
      if (!providedOtp) {
        return res.status(400).json({
          success: false,
          message: "Le code OTP est requis pour terminer la course",
          data: {},
        });
      }
      if (providedOtp !== storedOtp) {
        return res.status(400).json({
          success: false,
          message: "Code OTP invalide",
          data: {},
        });
      }
      updateData.completionOtpValidatedAt = new Date();
    }

    await Order.update(updateData, { where: { id: orderId } });
    if ((status === "COMPLETED" || status === "CANCELLED") && order.driverId) {
      await User.update({ isAvailable: true }, { where: { id: order.driverId } });
    }

    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit("order_status_changed", {
      orderId,
      status,
      driverId: order.driverId,
    });
    io.to('rides').emit('ride:updated', { id: orderId, status, driverId: order.driverId });

    return res.status(200).json({
      success: true,
      message: "Delivery status updated",
      data: { orderId, status },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to update delivery status", data: {} });
  }
};

export const updateDriverLocationForDelivery = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId, latitude, longitude } = req.body;

    if (!driverId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: "driverId, latitude and longitude are required", data: {} });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found", data: {} });
    }
    if (order.driverId && order.driverId !== driverId) {
      return res.status(403).json({ success: false, message: "Driver not assigned to this order", data: {} });
    }

    await User.update({ latitude: Number(latitude), longitude: Number(longitude) }, { where: { id: driverId } });

    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit("driver_location_updated", {
      orderId,
      driverId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      timestamp: new Date(),
    });
    io.to('rides').emit('driver_location_updated', {
      orderId,
      driverId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      timestamp: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Driver location updated",
      data: { orderId, driverId, latitude: Number(latitude), longitude: Number(longitude) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to update location", data: {} });
  }
};

export const getDeliveryTracking = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findByPk(orderId, { raw: true });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found", data: {} });
    }

    let driver: any = null;
    if (order.driverId) {
      driver = await User.findByPk(order.driverId, {
        attributes: ["id", "name", "phone", "latitude", "longitude", "isAvailable", "isActive"],
        raw: true,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery tracking loaded",
      data: {
        order,
        driver,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load tracking", data: {} });
  }
};






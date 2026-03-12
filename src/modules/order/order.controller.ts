import { Request, Response } from 'express';
import { sendNotificationToDriver } from '../../services/notification.service';
import { Server } from 'socket.io';
import User from '../../models/user.model';
import { Op } from 'sequelize';
import Order from '../../models/order.model';
import UserAddress from '../../models/user-address.model';
import DriverVehicle from "../../models/driver-vehicle.model";
import DriverDocument from "../../models/driver-document.model";
import DriverRevenueConfig from "../../models/driver-revenue-config.model";
import { calculateDriverRevenue } from "../../services/revenue.service";

const DELIVERY_STATUSES = ["PENDING", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "COMPLETED", "CANCELLED"] as const;

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

async function buildDeliveryRevenue(vehicleType: string, distance: unknown, providedRevenue?: unknown) {
  const manualRevenue = parseNumber(providedRevenue);
  if (manualRevenue !== null && manualRevenue >= 0) {
    return {
      revenuePerDelivery: manualRevenue,
      platformCommission: 0,
      serviceFee: 0,
    };
  }

  const config = await DriverRevenueConfig.findOne({ where: { vehicleType } });
  if (!config) {
    return {
      revenuePerDelivery: 0,
      platformCommission: 0,
      serviceFee: 0,
    };
  }

  const calculation = calculateDriverRevenue(config, {
    distanceKm: extractDistanceKm(distance),
    durationMinutes: 0,
    tip: 0,
    extras: 0,
  });

  return {
    revenuePerDelivery: calculation.driverEarnings,
    platformCommission: calculation.platformCommission,
    serviceFee: calculation.serviceFee,
  };
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
          price,
          vehicleId,
          distance,
          revenuePerDelivery,
        } = req.body;
        console.log(`userId = ${userId}`);
        console.log(`pickupLocation = ${pickupLocation}`);
        console.log(`pickupAddress = ${pickupAddress}`);
        console.log(`destinationLocation = ${destinationLocation}`);
        console.log(`destinationAddress = ${destinationAddress}`);
        console.log(`price = ${price}`);
        console.log(`distance = ${distance}`);
        console.log(`vehicleId = ${vehicleId}`); 
        // 1. ENREGISTREMENT EN BASE DE DONNÃ‰ES

        const revenue = await buildDeliveryRevenue(vehicleId, distance, revenuePerDelivery);

        const newOrder = await Order.create({
            userId,
            pickupLocation,
            pickupAddress,
            destinationLocation,
            destinationAddress,
            price,
            distance,
            revenuePerDelivery: revenue.revenuePerDelivery,
            platformCommission: revenue.platformCommission,
            serviceFee: revenue.serviceFee,
            vehicleType: vehicleId,
            status: 'PENDING'
        });

        await touchRecentlyUsedAddresses(userId, [
          { location: pickupLocation, address: pickupAddress },
          { location: destinationLocation, address: destinationAddress },
        ]);

        // const newOrder = await OrderModel.create({...});
        console.log(`Nouvelle commande reÃ§ue pour ${vehicleId} Ã  ${price} FCFA`);
        
        // 2. RÃ©cupÃ©rer l'instance Socket.io
        const io: Server = (req as any).io;
        // On envoie l'Ã©vÃ©nement 'new_ride_request' Ã  tous ceux dans la salle 'drivers'
        io.to('drivers').emit('new_ride_request', {
            orderId: newOrder.id, // Utilise le vrai ID gÃ©nÃ©rÃ© par la DB
            pickupAddress: pickupLocation,      // "Lat,Lng" ou adresse texte
            deliveryAddress: destinationLocation,
            price: price,
            distance: distance,
            vehicleType: vehicleId,
            timestamp: new Date()
        });
        io.to('rides').emit('ride:created', newOrder);
        console.log(`Notification commande reÃ§ue pour ${vehicleId} Ã  ${price} FCFA`);

        // // 2. Simulation : Trouver les tokens FCM des livreurs proches 
        // // (Dans la rÃ©alitÃ©, tu ferais une requÃªte en base de donnÃ©es ici)
        // const nearbyDriversTokens = ["TOKEN_FCM_DU_LIVREUR_1", "TOKEN_FCM_DU_LIVREUR_2"];

        console.log(`reponse commande ${newOrder!.id} reÃ§ue pour ${vehicleId} Ã  ${price} FCFA`);
        return res.status(201).json({
            success: true,
            message: "Recherche de livreur lancÃ©e",
            order: newOrder
        });
    } catch (error) {
        return res.status(500).json({ error: "Erreur lors de la crÃ©ation de la commande" });
    }
};


export const getOrders = async (req: Request, res: Response) => {
  try {
    // const { role, userId } = req.query; // On peut filtrer par utilisateur ou statut

    // const whereClause: any = {};
    // if (userId) whereClause.userId = userId;
    // if (req.query.status) whereClause.status = req.query.status;

    const { archived } = req.query as Record<string, string | undefined>;
    const archivedValue = archived === "true";
    const orders = await Order.findAll({
      where: { isArchived: archivedValue },
      include: [
        {
          model: User,
          as: "driver",
          attributes: ["id", "name", "phone"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json(orders);
  } catch (error) {
    return res.status(500).json({ error: "Erreur lors de la rÃ©cupÃ©ration" });
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
    const { status, driverId } = req.body; 
    // status peut Ãªtre : 'ACCEPTED', 'CANCELLED', 'COMPLETED'

console.log({orderId},{status},{driverId});
    // 1. VÃ©rifier si la commande existe
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ message: "Commande non trouvÃ©e" });
    }

    // // 2. SÃ©curitÃ© : Si un livreur accepte, vÃ©rifier qu'elle n'est pas dÃ©jÃ  prise
    // if (status === 'ACCEPTED' && order.status !== 'PENDING') {
    //   return res.status(400).json({ message: "Cette commande a dÃ©jÃ  Ã©tÃ© acceptÃ©e par un autre livreur" });
    // }

    // 3. Mise Ã  jour
    const updateData: any = { status };
    if (driverId) updateData.driverId = driverId;

    if (status === "ACCEPTED" && driverId) {
      const activeVehicle = await DriverVehicle.findOne({
        where: { driverId, isPrimary: true },
        order: [["createdAt", "DESC"]],
      });
      if (activeVehicle) updateData.driverVehicleId = activeVehicle.get("id");
    }

    await Order.update(updateData, {
      where: { id: orderId }
    });
    console.log("socket emit to order_status_changed 1 ") ;
    // 4. (Optionnel) Notifier le client via Socket.io que sa commande est acceptÃ©e
    const io: Server = (req as any).io;
    io.to(`user_${order.userId}`).emit('order_status_changed', {
      orderId,
      status,
      driverId
    });
    io.to('rides').emit('ride:updated', { id: orderId, status, driverId });

    console.log("socket emit to order_status_changed 2 ") ;
    return res.status(200).json({ 
      success: true, 
      message: `Commande mise Ã  jour : ${status}` 
    });

  } catch (error) {
    return res.status(500).json({ error: "Erreur lors de la mise Ã  jour" });
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

    const revenue = await buildDeliveryRevenue(vehicleType, distance, revenuePerDelivery);

    const newOrder = await Order.create({
      userId,
      pickupLocation,
      pickupAddress,
      destinationLocation,
      destinationAddress,
      price: Number(price || 0),
      distance: String(distance || ""),
      revenuePerDelivery: revenue.revenuePerDelivery,
      platformCommission: revenue.platformCommission,
      serviceFee: revenue.serviceFee,
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
      data: { order: newOrder },
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

    // Ancienne logique (plus proche livreur) conservÃ©e en commentaire:
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
        "Une nouvelle course vous est attribuée.",
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
    });
    io.to('rides').emit('ride:updated', { id: orderId, status: "ACCEPTED", driverId });

    return res.status(200).json({
      success: true,
      message: "Delivery accepted",
      data: { orderId, driverId, status: "ACCEPTED" },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to accept delivery", data: {} });
  }
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body as { status: typeof DELIVERY_STATUSES[number] };

    if (!status || !DELIVERY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status", data: {} });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found", data: {} });
    }

    await Order.update({ status }, { where: { id: orderId } });
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






import { Op } from "sequelize";
import { Server } from "socket.io";
import Order from "../models/order.model";

export type UserLocationPayload = {
  userId: string;
  role: string;
  latitude: number;
  longitude: number;
  locationUpdatedAt: string;
};

export type OrderDriverLocationPayload = UserLocationPayload & {
  orderId: string;
  driverId: string;
  status: string;
};

const TRACKING_ORDER_STATUSES = [
  "ACCEPTED",
  "DRIVER_ARRIVED_PICKUP",
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
] as const;

export function emitUserLocationUpdated(
  io: Server,
  payload: UserLocationPayload
) {
  io.to(`user_${payload.userId}`).emit("user:location_updated", payload);
  io.to(`role_${payload.role}`).emit("user:location_updated", payload);
  io.emit("location:updated", payload);
}

export async function emitDriverOrderLocationUpdated(
  io: Server,
  payload: UserLocationPayload
) {
  if (String(payload.role || "").trim().toLowerCase() !== "livreur") {
    return;
  }

  const activeOrders = await Order.findAll({
    where: {
      driverId: payload.userId,
      status: {
        [Op.in]: TRACKING_ORDER_STATUSES,
      },
    },
    attributes: ["id", "status"],
  });

  for (const finalOrder of activeOrders) {
    const orderId = String(finalOrder.get("id") || "").trim();
    if (!orderId) continue;

    const orderPayload: OrderDriverLocationPayload = {
      ...payload,
      orderId,
      driverId: payload.userId,
      status: String(finalOrder.get("status") || "").trim(),
    };

    io.to(`order_${orderId}`).emit("order:driver_location_updated", orderPayload);
    io.to(`order_${orderId}`).emit("driver_location_updated", orderPayload);
  }
}

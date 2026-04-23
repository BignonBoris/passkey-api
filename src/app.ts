import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { Op } from "sequelize";
import User from "./models/user.model";
import Order from "./models/order.model";
import Payment from "./models/payment.model";

import routes from "./routes";
import { swaggerSpec } from "./docs/swagger";
import { errorHandler } from "./middlewares/errorHandler";
import {
  emitUserLocationUpdated,
} from "./realtime/location.events";
import { setSocketServer } from "./realtime/socket.instance";
import { handleFedaPayWebhook, handleStripeWebhook } from "./modules/payments/payments.controller";
import { resolveCountryFromCoordinates } from "./services/country.service";
import { markOrderSearchDriverDeclined } from "./services/order-search-stats.service";

const app = express();

app.use(cors());
app.use(helmet());
app.post("/api/payments/webhooks/fedapay", express.raw({ type: "application/json" }), handleFedaPayWebhook);
app.post("/api/payments/webhooks/stripe", express.raw({ type: "application/json" }), handleStripeWebhook);
app.use(express.json());
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setSocketServer(io);

io.on("connection", (socket) => {
  console.log("Un utilisateur connecte :", socket.id);

  socket.on("join", (value: string) => {
    if (!value) return;
    if (value.startsWith("user_")) {
      socket.join(value);
      return;
    }
    socket.join(`user_${value}`);
  });

  socket.on("join_user_room", (userId: string) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
  });

  socket.on("location:subscribe", (payload: any) => {
    const userId = String(payload?.userId || "").trim();
    const role = String(payload?.role || "").trim().toLowerCase();
    if (!userId) return;
    socket.join(`user_${userId}`);
    if (role) {
      socket.join(`role_${role}`);
    }
  });

  socket.on("join_chat_room", (conversationId: string) => {
    if (!conversationId) return;
    socket.join(`chat_${conversationId}`);
  });

  socket.on("join_driver_room", () => {
    socket.join("drivers");
    socket.join("role_courier");
    console.log(`Socket ${socket.id} a rejoint la salle des livreurs`);
  });

  socket.on("join_room", (room: string) => {
    if (!room) return;
    socket.join(room);
    console.log(`Socket ${socket.id} a rejoint la salle: ${room}`);
  });

  socket.on("leave_driver_room", () => {
    socket.leave("drivers");
    socket.leave("role_courier");
    console.log(`Socket ${socket.id} a quitte la salle des livreurs`);
  });

  socket.on("leave_room", (room: string) => {
    if (!room) return;
    socket.leave(room);
    console.log(`Socket ${socket.id} a quitte la salle: ${room}`);
  });

  socket.on("rider_call_driver", (payload: any) => {
    const driverId = String(payload?.driverId || "").trim();
    const callerId = String(payload?.callerId || "").trim();
    if (!driverId || !callerId) return;

    const eventPayload = {
      driverId,
      callerId,
      customerId: callerId,
      callerName: String(payload?.callerName || "Usager"),
      callerPhone: String(payload?.callerPhone || ""),
      message: String(payload?.message || "Nouvel appel usager"),
      orderId: String(payload?.orderId || ""),
      requestId: String(payload?.requestId || payload?.orderId || ""),
      pickupAddress: String(payload?.pickupAddress || ""),
      destinationAddress: String(payload?.destinationAddress || ""),
      distance: String(payload?.distance || ""),
      price: String(payload?.price || ""),
      vehicleName: String(payload?.vehicleName || ""),
      pickupLat: payload?.pickupLat ?? null,
      pickupLng: payload?.pickupLng ?? null,
      destinationLat: payload?.destinationLat ?? null,
      destinationLng: payload?.destinationLng ?? null,
      createdAt: payload?.createdAt || new Date().toISOString(),
    };

    io.to(`user_${driverId}`).emit("driver:incoming_call", eventPayload);
    io.to(`user_${driverId}`).emit("new_delivery_request", eventPayload);
    io.to(`user_${callerId}`).emit("driver:call_status", {
      status: "sent",
      driverId,
      callerId,
      orderId: eventPayload.orderId,
      requestId: eventPayload.requestId,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on("driver_call_response", (payload: any) => {
    const callerId = String(payload?.callerId || "").trim();
    const driverId = String(payload?.driverId || "").trim();
    const decision = String(payload?.decision || "").trim().toLowerCase();
    if (!callerId || !driverId || !decision) return;
    const orderId = String(payload?.orderId || "").trim();

    if (decision === "declined" && orderId) {
      markOrderSearchDriverDeclined(orderId, {
        id: driverId,
        name: String(payload?.driverName || "").trim(),
        phone: String(payload?.driverPhone || "").trim(),
      }).catch(console.error);
    }

    io.to(`user_${callerId}`).emit("driver:call_status", {
      status: decision,
      driverId,
      callerId,
      orderId,
      requestId: String(payload?.requestId || payload?.orderId || ""),
      createdAt: payload?.createdAt || new Date().toISOString(),
    });
  });

  socket.on("location:update", async (payload: any) => {
    const userId = String(payload?.userId || "").trim();
    const role = String(payload?.role || "").trim().toLowerCase();
    const latitude = Number(payload?.latitude);
    const longitude = Number(payload?.longitude);

    if (!userId || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return;
    }

    const locationUpdatedAt = new Date();
    const countryResolution = await resolveCountryFromCoordinates(latitude, longitude);
    await User.update(
      {
        countryId: String(countryResolution.country.get("id") || ""),
        latitude,
        longitude,
        locationUpdatedAt,
      },
      { where: { id: userId } }
    );

    emitUserLocationUpdated(io, {
      userId,
      role: role || "usager",
      latitude,
      longitude,
      locationUpdatedAt: locationUpdatedAt.toISOString(),
    });
  });
});

setInterval(async () => {
  try {
    const expiredOrders = await Order.findAll({
      where: {
        status: "ACCEPTED",
        paymentPromptDeadlineAt: { [Op.lte]: new Date() },
        paymentCheckoutStartedAt: null,
      },
    });

    for (const order of expiredOrders) {
      const orderId = String(order.get("id") || "").trim();
      const payment = await Payment.findOne({
        where: { orderId },
        order: [["createdAt", "DESC"]],
      });
      const paymentMethod = String(payment?.get("method") || "CASH").trim().toUpperCase();
      const paymentStatus = String(payment?.get("status") || "PENDING").trim().toUpperCase();
      if (!["MOBILE_MONEY", "CARD"].includes(paymentMethod) || paymentStatus === "PAID") {
        continue;
      }

      await order.update({
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "SYSTEM",
        cancellationReason: "Paiement non lance avant expiration du delai.",
        paymentPromptDeadlineAt: null,
      });

      const driverId = String(order.get("driverId") || "").trim();
      if (driverId) {
        await User.update({ isAvailable: true }, { where: { id: driverId } });
      }

      const payload = {
        orderId,
        status: "CANCELLED",
        cancelledBy: "SYSTEM",
        cancellationReason: "Le delai de paiement a expire avant l'ouverture du paiement.",
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        paymentPromptDeadlineAt: null,
        paymentCheckoutStartedAt: null,
      };

      io.to(`user_${order.get("userId")}`).emit("order_status_changed", payload);
      if (driverId) {
        io.to(`user_${driverId}`).emit("order_status_changed", payload);
      }
      io.to("rides").emit("ride:updated", {
        id: orderId,
        orderId,
        status: "CANCELLED",
        driverId,
        cancellationReason: payload.cancellationReason,
      });
    }
  } catch (error) {
    console.warn("payment prompt expiry watcher skipped:", error);
  }
}, 15000);

app.use((req, _res, next) => {
  (req as any).io = io;
  next();
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api", routes);
app.use(errorHandler);

export default server;

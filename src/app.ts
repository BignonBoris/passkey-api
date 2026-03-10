import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { Server } from "socket.io";
import http from "http";
import path from "path";

import routes from "./routes";
import { swaggerSpec } from "./docs/swagger";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

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

  socket.on("join_chat_room", (conversationId: string) => {
    if (!conversationId) return;
    socket.join(`chat_${conversationId}`);
  });

  socket.on("join_driver_room", () => {
    socket.join("drivers");
    console.log(`Socket ${socket.id} a rejoint la salle des livreurs`);
  });

  socket.on("join_room", (room: string) => {
    if (!room) return;
    socket.join(room);
    console.log(`Socket ${socket.id} a rejoint la salle: ${room}`);
  });

  socket.on("rider_call_driver", (payload: any) => {
    const driverId = String(payload?.driverId || "").trim();
    const callerId = String(payload?.callerId || "").trim();
    if (!driverId || !callerId) return;

    const eventPayload = {
      driverId,
      callerId,
      callerName: String(payload?.callerName || "Usager"),
      callerPhone: String(payload?.callerPhone || ""),
      message: String(payload?.message || "Nouvel appel usager"),
      orderId: String(payload?.orderId || ""),
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
    io.to(`user_${callerId}`).emit("driver:call_status", {
      status: "sent",
      driverId,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on("driver_call_response", (payload: any) => {
    const callerId = String(payload?.callerId || "").trim();
    const driverId = String(payload?.driverId || "").trim();
    const decision = String(payload?.decision || "").trim().toLowerCase();
    if (!callerId || !driverId || !decision) return;

    io.to(`user_${callerId}`).emit("driver:call_status", {
      status: decision,
      driverId,
      createdAt: payload?.createdAt || new Date().toISOString(),
    });
  });
});

app.use((req, _res, next) => {
  (req as any).io = io;
  next();
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api", routes);
app.use(errorHandler);

export default server;

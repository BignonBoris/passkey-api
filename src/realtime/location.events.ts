import { Server } from "socket.io";

export type UserLocationPayload = {
  userId: string;
  role: string;
  latitude: number;
  longitude: number;
  locationUpdatedAt: string;
};

export function emitUserLocationUpdated(
  io: Server,
  payload: UserLocationPayload
) {
  io.to(`user_${payload.userId}`).emit("user:location_updated", payload);
  io.to(`role_${payload.role}`).emit("user:location_updated", payload);
  io.emit("location:updated", payload);
}

import { Server } from "socket.io";

let ioInstance: Server | null = null;

export type SocketFallbackOptions = {
  room: string;
  event?: string;
  payload?: Record<string, any>;
};

export function setSocketServer(io: Server) {
  ioInstance = io;
}

export function getSocketServer(): Server | null {
  return ioInstance;
}

export function emitSocketFallback(options?: SocketFallbackOptions | null): boolean {
  if (!ioInstance || !options?.room) {
    return false;
  }

  const payload = {
    ...(options.payload || {}),
    deliveredVia: "socket",
    deliveredAt: new Date().toISOString(),
  };

  ioInstance.to(options.room).emit("notification:new", payload);

  if (options.event) {
    ioInstance.to(options.room).emit(options.event, payload);
  }

  return true;
}

import type { Socket } from "socket.io";
import { roomForBuilding } from "../core/relay.js";
import { connectedClients } from "../config/registry.js";

/** Wires per-connection event handlers and the connection-count gauge. */
export function handleConnection(socket: Socket): void {
  connectedClients.inc();

  socket.on("join_room", (userId: string) => {
    socket.join(userId);
  });

  socket.on("subscribe_building", (buildingId: string) => {
    socket.join(roomForBuilding(buildingId));
  });

  socket.on("unsubscribe_building", (buildingId: string) => {
    socket.leave(roomForBuilding(buildingId));
  });

  socket.on("disconnect", () => {
    connectedClients.dec();
  });
}

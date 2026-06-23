import type { Socket } from "socket.io";
import { roomForBuilding, roomForDomain } from "../core/relay.js";
import { connectedClients } from "../config/registry.js";
import type { SocketIdentity } from "../auth.js";

/** Wires per-connection event handlers and the connection-count gauge. */
export function handleConnection(socket: Socket): void {
  connectedClients.inc();
  const identity = socket.data.identity as SocketIdentity;
  for (const domain of identity.domains) socket.join(roomForDomain(domain));

  socket.on("subscribe_building", (buildingId: string) => {
    // Authenticated members only. Per-building authz (which domain owns this
    // building) needs a twin-service lookup — deferred.
    if (identity.domains.length === 0) return;
    socket.join(roomForBuilding(buildingId));
  });

  socket.on("unsubscribe_building", (buildingId: string) => {
    socket.leave(roomForBuilding(buildingId));
  });

  socket.on("disconnect", () => {
    connectedClients.dec();
  });
}

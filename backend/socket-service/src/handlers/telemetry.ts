import type { Server } from "socket.io";
import { buildingIdFromChannel, roomForBuilding } from "../core/relay.js";
import { telemetryRelayedTotal } from "../config/registry.js";

/** Relays a filtered telemetry message to its building's room. */
export function relayTelemetry(
  io: Server,
  message: string,
  channel: string,
): void {
  const room = roomForBuilding(buildingIdFromChannel(channel));
  io.to(room).emit("telemetry", JSON.parse(message));
  telemetryRelayedTotal.inc();
}

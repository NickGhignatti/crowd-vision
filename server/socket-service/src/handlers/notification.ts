import type { Server } from "socket.io";
import { roomForDomain } from "../core/relay.js";

/**
 * Relays a notification. A payload scoped to a `domainName` reaches only that
 * domain's room; an unscoped payload is broadcast to every client.
 */
export function relayNotification(io: Server, message: string): void {
  const payload = JSON.parse(message);
  if (payload.domainName) {
    io.to(roomForDomain(payload.domainName)).emit("notification", payload);
  } else {
    io.emit("notification", payload); // unscoped system message → all clients
  }
}

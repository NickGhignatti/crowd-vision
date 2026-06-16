import type { Server } from "socket.io";

/**
 * Broadcasts a notification to every connected client.
 *
 * broadcast for now. Per-user targeting (`io.to(userId)`) should be better.
 */
export function relayNotification(io: Server, message: string): void {
  console.info("[Event] New notification received:", message);
  io.emit("notification", JSON.parse(message));
}

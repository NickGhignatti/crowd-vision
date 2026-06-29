import { redisSubscriber } from "../config/redis.js";
import { sendTemperatureAlert } from "./notificationService.js";

export const initializeEventListeners = async () => {
  console.info(
    "[notification-service] Initializing Redis Event Subscriptions...",
  );

  // ── Temperature Anomalies ─────────────────────────────────────────────────
  await redisSubscriber.subscribe("alerts:temperature", async (message) => {
    try {
      const payload = JSON.parse(message);
      const breach =
        payload.direction === "high"
          ? " (above maximum)"
          : payload.direction === "low"
            ? " (below minimum)"
            : "";
      const alertMessage = `${payload.buildingId} : ${payload.roomId} is ${payload.temperature}°C${breach}`;
      await sendTemperatureAlert(alertMessage, payload.timestamp, "danger");
    } catch (error) {
      console.error("[Event] Failed to process temperature alert:", error);
    }
  });
};

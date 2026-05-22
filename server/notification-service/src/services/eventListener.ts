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
      console.info(
        `[Event] 🌡️ Temperature anomaly received for ${payload.roomId}`,
      );
      const alertMessage = `${payload.buildingId} : ${payload.roomId} excedeed ${payload.temperature}°C`;
      await sendTemperatureAlert(alertMessage, payload.timestamp);
    } catch (error) {
      console.error("[Event] Failed to process temperature alert:", error);
    }
  });
};

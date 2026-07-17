import { redisSubscriber } from "../config/redis.js";
import {
  deliverTemperatureAlertToDomains,
  getDomainsForBuilding,
  isTemperatureAlertOnCooldown,
  sendTemperatureAlert,
  setTemperatureAlertCooldown,
} from "./notificationService.js";
import { NotificationType } from "../models/notificationSubscription.js";

export const initializeEventListeners = async () => {
  console.info(
    "[notification-service] Initializing Redis Event Subscriptions...",
  );

  // ── Temperature Anomalies ─────────────────────────────────────────────────
  // This is the path real sensor-triggered breaches actually take (see
  // TemperatureModuleService.evaluateThresholds in sensor-service) — unlike
  // POST /push/temperature, there is no authenticated caller here to gate the
  // route behind, so it has to carry its own debounce, domain resolution, and
  // push delivery rather than relying on an HTTP handler for them.
  await redisSubscriber.subscribe("alerts:temperature", async (message) => {
    try {
      const payload = JSON.parse(message);
      const { buildingId, roomId, temperature } = payload;
      const breach =
        payload.direction === "high"
          ? " (above maximum)"
          : payload.direction === "low"
            ? " (below minimum)"
            : "";
      const alertMessage = `${buildingId} : ${roomId} is ${temperature}°C${breach}`;

      if (await isTemperatureAlertOnCooldown(buildingId, roomId)) {
        return;
      }

      let domainNames: string[] = [];
      try {
        domainNames = await getDomainsForBuilding(buildingId);
      } catch (err) {
        console.error(
          `[Event] Failed to resolve domains for building ${buildingId}:`,
          err,
        );
      }

      if (domainNames.length > 0) {
        await deliverTemperatureAlertToDomains(
          alertMessage,
          buildingId,
          domainNames,
          NotificationType.TEMPERATURE,
        );
      } else {
        // No domain could be resolved (unregistered building, or the twin
        // lookup failed) — fall back to the old unscoped broadcast so the
        // alert still reaches someone instead of silently vanishing.
        await sendTemperatureAlert(alertMessage, payload.timestamp, "danger");
      }

      await setTemperatureAlertCooldown(buildingId, roomId);
    } catch (error) {
      console.error("[Event] Failed to process temperature alert:", error);
    }
  });
};

import redisClient from "../config/redis.js";
import { sendPushToDomain } from "./pushService.js";
import { NotificationType } from "../models/notificationSubscription.js";

// Internal gateway base for server-to-server calls (routed through Caddy).
export const getGatewayUrl = () =>
  process.env.GATEWAY_URL || "http://localhost:3000";

// twin-service's own cluster-internal address — used for the building→domain
// lookup instead of looping back out through the public gateway, since that
// call would otherwise need a real re-verifiable JWT rather than the
// mesh-injected claims header this service actually holds.
export const getTwinServiceUrl = () =>
  process.env.TWIN_SERVICE_URL || "http://localhost:3000";

// System identity for building→domain lookups that have no end-user request
// to forward a claims header from (e.g. an automatic sensor-triggered alert
// arriving over Redis pub/sub, not HTTP). twin-service's /domain/:building_name
// route requires *a* structurally valid x-gateway-claims header to satisfy its
// GatewayClaims extractor, but the extractor's value is unused by that
// specific handler (no per-identity authorization happens on this route) —
// see auth-architecture.qd.
const SYSTEM_CLAIMS_HEADER = Buffer.from(
  JSON.stringify({ sub: "system:notification-service", memberships: [] }),
).toString("base64");

// Resolves which domain(s) a building belongs to. Pass a real caller's
// x-gateway-claims header when one is available (an authenticated HTTP
// request); omit it for server-initiated lookups, which fall back to the
// system identity above.
export const getDomainsForBuilding = async (
  buildingName: string,
  claimsHeader: string = SYSTEM_CLAIMS_HEADER,
): Promise<string[]> => {
  const response = await fetch(
    `${getTwinServiceUrl()}/domain/${encodeURIComponent(buildingName)}`,
    { headers: { "x-gateway-claims": claimsHeader } },
  );

  if (!response.ok) {
    throw new Error(`Twin lookup failed for building ${buildingName}`);
  }

  return (await response.json()) as string[];
};

const TEMP_ALERT_COOLDOWN_SECONDS = 300;

const temperatureAlertCacheKey = (buildingId: string, roomId?: string) =>
  `temp_alert:${buildingId || "unknown"}:${roomId || "unknown"}`;

export const isTemperatureAlertOnCooldown = async (
  buildingId: string,
  roomId?: string,
): Promise<boolean> =>
  Boolean(await redisClient.get(temperatureAlertCacheKey(buildingId, roomId)));

export const setTemperatureAlertCooldown = async (
  buildingId: string,
  roomId?: string,
): Promise<void> => {
  await redisClient.set(temperatureAlertCacheKey(buildingId, roomId), "1", {
    EX: TEMP_ALERT_COOLDOWN_SECONDS,
  });
};

// Delivers a temperature alert to every domain a building belongs to, both
// as an in-app notification and a push notification to subscribed accounts.
export const deliverTemperatureAlertToDomains = async (
  message: string,
  buildingId: string,
  domainNames: string[],
  notificationType: NotificationType = NotificationType.TEMPERATURE,
): Promise<void> => {
  const uniqueDomainNames = [...new Set(domainNames.filter(Boolean))];

  for (const domainName of uniqueDomainNames) {
    await publishNotification(message, "danger", domainName);
    await sendPushToDomain(
      {
        title: `Temperature Alert${buildingId ? ` - ${buildingId}` : ""}`,
        message,
      },
      domainName,
      notificationType,
    );
  }
};

export const publishNotification = async (
  message: string,
  type: string = "info",
  domainName?: string,
) => {
  const payload: {
    id: string;
    message: string;
    type: string;
    timestamp: Date;
    domainName?: string;
  } = {
    id: Date.now().toString(),
    message,
    type,
    timestamp: new Date(),
  };

  if (domainName) {
    payload.domainName = domainName;
  }

  await redisClient.publish("notifications", JSON.stringify(payload));
};

export const sendTemperatureAlert = async (
  message: string,
  timestamp: Date | number,
  dangerLevel: string = "info",
) => {
  await redisClient.publish(
    "notifications",
    JSON.stringify({
      id: Date.now().toString(),
      message,
      type: dangerLevel,
      // Upstream events carry a Unix-ms number; normalise to a Date so the
      // serialized payload matches publishNotification (ISO string) and the
      // client's `timestamp: Date` contract.
      timestamp: new Date(timestamp),
    }),
  );
};

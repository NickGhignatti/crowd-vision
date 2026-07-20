import redisClient from "../config/redis.js";
import { sendPushToDomain } from "./pushService.js";
import { NotificationType } from "../models/notificationSubscription.js";

export const getGatewayUrl = () =>
  process.env.GATEWAY_URL || "http://localhost:3000";
export const getTwinServiceUrl = () =>
  process.env.TWIN_SERVICE_URL || "http://localhost:3000";

// System identity for building→domain lookups with no end-user request to forward a claims
// header from (e.g. Redis-triggered alerts). The route requires a structurally valid header but ignores its value — see auth-architecture.qd.
const SYSTEM_CLAIMS_HEADER = Buffer.from(
  JSON.stringify({ sub: "system:notification-service", memberships: [] }),
).toString("base64");

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

// Delivers a temperature alert to every domain a building belongs to.
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
      timestamp: new Date(timestamp),
    }),
  );
};

import redisClient from "../config/redis.js";

// Internal gateway base for server-to-server calls (routed through Caddy).
export const getGatewayUrl = () =>
  process.env.GATEWAY_URL || "http://localhost:3000";

// twin-service's own cluster-internal address — used for the building→domain
// lookup instead of looping back out through the public gateway, since that
// call would otherwise need a real re-verifiable JWT rather than the
// mesh-injected claims header this service actually holds.
export const getTwinServiceUrl = () =>
  process.env.TWIN_SERVICE_URL || "http://localhost:3000";

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

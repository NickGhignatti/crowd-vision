import { InternalError } from "../models/error.js";

export const getSensorServiceUrl = () =>
  process.env.SENSOR_SERVICE_URL || "http://localhost:3000";
export const shouldSyncThresholds = () => process.env.NODE_ENV !== "test";
export const getClientUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";

// Name of the cookie auth-service sets the JWT in; shared across the fleet.
export const COOKIE_NAME =
  process.env.JWT_COOKIE_NAME ?? "authentication_token";

// The HS256 secret auth-service signs JWTs with. Every service that verifies a
// token reads the same secret — keep it in sync across deployments.
export const getTokenSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new InternalError("Missing JWT_SECRET configuration");
  return secret;
};

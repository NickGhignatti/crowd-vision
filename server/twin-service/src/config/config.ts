import { InternalError } from "../models/error.js";

export const getSensorServiceUrl = () =>
  process.env.SENSOR_SERVICE_URL || "http://localhost:3000";
export const shouldSyncThresholds = () => process.env.NODE_ENV !== "test";
export const getClientUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";

// Name of the cookie claims-gateway sets the JWT in; shared across the fleet.
export const COOKIE_NAME =
  process.env.JWT_COOKIE_NAME ?? "authentication_token";

// claims-gateway's RS256 JWKS + issuer — the sole verification path (see
// middlewares/authentication.ts). auth-service, the old HS256 minter, has
// been decommissioned.
export const getGatewayJwksUri = () => {
  const uri = process.env.GATEWAY_JWKS_URI;
  if (!uri) throw new InternalError("Missing GATEWAY_JWKS_URI configuration");
  return uri;
};
export const getGatewayIssuer = () => process.env.GATEWAY_ISSUER || "cv-gateway";

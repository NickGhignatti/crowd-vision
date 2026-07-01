// Internal gateway base for server-to-server calls (routed through Caddy).
export const getGatewayUrl = () =>
  process.env.GATEWAY_URL || "http://localhost:3000";
// Public, browser-facing base used for OIDC redirect URIs.
export const getPublicUrl = () =>
  process.env.PUBLIC_URL || "http://localhost";
export const getClientUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";
export const getAdminSecret = () => process.env.INTERNAL_ADMIN_SECRET;
export const getTokenSecret = () => process.env.JWT_SECRET;
export const COOKIE_NAME = "authentication_token";
export const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // HTTPS only in prod
  sameSite: "strict" as const,
  maxAge: 3 * 60 * 60 * 1000,
});

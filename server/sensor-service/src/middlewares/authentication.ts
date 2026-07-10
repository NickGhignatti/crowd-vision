import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { getGatewaySigningKey, getGatewayIssuer } from "../config/gatewayJwks.js";

// Same cookie name claims-gateway uses across the fleet.
const COOKIE_NAME = process.env.JWT_COOKIE_NAME ?? "authentication_token";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
    }
  }
}

// Browsers send the JWT in a cookie; trusted services (twin-service forwarding the
// caller's identity on the threshold sync) send it as `Authorization: Bearer`.
const extractToken = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();

  return undefined;
};

interface GatewayMembership {
  domain: string;
  role: string;
  externalId?: string;
}

// Maps claims-gateway's StandardClaims shape onto the legacy
// {accountId, accountMemberships:[{domainName,role}]} shape this service
// already reads — see twin-service's identical helper for the full rationale.
const normalizeGatewayClaims = (payload: JwtPayload): JwtPayload => {
  const memberships = (payload.memberships ?? []) as GatewayMembership[];
  return {
    ...payload,
    accountId: payload.sub,
    accountMemberships: memberships.map((m) => ({
      domainName: m.domain,
      role: m.role,
      ...(m.externalId ? { externalId: m.externalId } : {}),
    })),
  };
};

const verifyGatewayToken = async (
  token: string,
  kid: string | undefined,
): Promise<JwtPayload> => {
  const key = await getGatewaySigningKey(kid);
  const payload = jwt.verify(token, key, {
    algorithms: ["RS256"],
    issuer: getGatewayIssuer(),
  });
  if (typeof payload === "string") throw new Error("invalid token payload");
  return normalizeGatewayClaims(payload);
};

// Responds directly (rather than throwing) because sensor-service has no global
// error handler — each controller shapes its own response.
export const requireAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing authentication token" });
    return;
  }

  const header = jwt.decode(token, { complete: true })?.header;

  try {
    const payload = await verifyGatewayToken(token, header?.kid);

    if (!payload.accountId) {
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }
    req.account = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid authentication token" });
  }
};

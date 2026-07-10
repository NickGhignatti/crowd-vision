import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { UnauthorizedError } from "../models/error.js";
import { getGatewaySigningKey, getGatewayIssuer } from "../config/gatewayJwks.js";

// Same cookie name claims-gateway uses across the fleet.
const COOKIE_NAME = process.env.JWT_COOKIE_NAME ?? "authentication_token";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      // Raw token, forwarded to twin-service on the building→domain lookup.
      authToken?: string;
    }
  }
}

// Browsers send the JWT in a cookie; trusted services forward it as a bearer token.
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
// {accountName, accountMemberships:[{domainName,role}]} shape this service
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

export const requireAuthentication = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);
  if (!token) throw new UnauthorizedError("Missing authentication token");

  const header = jwt.decode(token, { complete: true })?.header;

  let payload: JwtPayload;
  try {
    payload = await verifyGatewayToken(token, header?.kid);
  } catch {
    throw new UnauthorizedError("Invalid authentication token");
  }

  if (!payload.accountName) {
    throw new UnauthorizedError("Authentication token is missing an account");
  }

  req.account = payload;
  req.authToken = token;
  next();
};

// The account the request acts as — never trust an account name from the body or
// URL, always the verified token (prevents reading/writing another user's data).
export const callerAccountName = (req: Request): string =>
  req.account?.accountName as string;

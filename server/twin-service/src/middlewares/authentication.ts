import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { COOKIE_NAME, getGatewayIssuer } from "../config/config.js";
import { getGatewaySigningKey } from "../config/gatewayJwks.js";
import { UnauthorizedError } from "../models/error.js";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      // Raw bearer/cookie token, kept so twin can forward the caller's identity
      // on its own service-to-service calls (e.g. the sensor threshold sync).
      authToken?: string;
    }
  }
}

// Browsers send the JWT as a cookie; trusted services (the RAG agent, twin's
// own outbound calls) forward it as `Authorization: Bearer`. Accept either so
// one guard covers both callers without a separate service credential.
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
// {accountId, accountMemberships:[{domainName,role}]} shape every existing
// route already reads — kept as-is post-migration so no downstream route
// handler needed to change, even though there's only one token source now.
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

  if (!payload.accountId) {
    throw new UnauthorizedError("Authentication token is missing an account id");
  }

  req.account = payload;
  req.authToken = token;
  next();
};

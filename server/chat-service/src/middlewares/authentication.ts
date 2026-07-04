import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { COOKIE_NAME, getGatewayIssuer } from "../config/config.js";
import { getGatewaySigningKey } from "../config/gatewayJwks.js";
import { UnauthorizedError } from "../models/error.js";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      userId?: string;
    }
  }
}

interface GatewayMembership {
  domain: string;
  role: string;
  externalId?: string;
}

// Maps claims-gateway's StandardClaims shape onto the legacy
// {accountId, accountMemberships:[{domainName,role}]} shape — see
// twin-service's identical helper for the full rationale.
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
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) throw new UnauthorizedError("Missing authentication token");

  const header = jwt.decode(token, { complete: true })?.header;

  let payload: JwtPayload;
  try {
    payload = await verifyGatewayToken(token, header?.kid);
  } catch {
    throw new UnauthorizedError("Invalid authentication token");
  }

  const userId = payload.accountId;
  if (typeof userId !== "string" || !userId) {
    throw new UnauthorizedError("Authentication token is missing an account id");
  }

  req.account = payload;
  req.userId = userId;
  next();
};

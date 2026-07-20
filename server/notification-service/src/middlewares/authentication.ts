import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import { UnauthorizedError } from "../models/error.js";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      // Raw x-gateway-claims header, forwarded to twin-service on the
      // building→domain lookup.
      authToken?: string;
    }
  }
}

interface GatewayMembership {
  domain: string;
  role: string;
  externalId?: string;
}

// Maps claims-gateway's StandardClaims onto the legacy {accountName, accountMemberships} shape
// this service reads.
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

// Istio validates the gateway JWT at ingress and injects it as this base64 header; notification-service
// trusts it rather than re-verifying a JWT itself.
export const requireAuthentication = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const header = req.headers["x-gateway-claims"];
  if (!header || typeof header !== "string") {
    throw new UnauthorizedError("Missing authentication token");
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as JwtPayload;
  } catch {
    throw new UnauthorizedError("Invalid authentication token");
  }

  if (!payload.accountName) {
    throw new UnauthorizedError("Authentication token is missing an account");
  }

  req.account = normalizeGatewayClaims(payload);
  req.authToken = header;
  next();
};

// The account the request acts as — never trust an account name from the body or
// URL, always the verified token (prevents reading/writing another user's data).
export const callerAccountName = (req: Request): string =>
  req.account?.accountName as string;

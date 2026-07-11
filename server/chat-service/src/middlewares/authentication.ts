import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import { UnauthorizedError } from "../models/error.js";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      userId?: string;
      // Raw x-gateway-claims header, forwarded to agent-service so it sees
      // the same caller identity Istio verified at the edge.
      authToken?: string;
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

// Istio's RequestAuthentication verifies the gateway JWT once at the ingress
// (extracted from the browser's cookie — see k8s/istio-request-authentication.yml)
// and injects the validated payload as this base64 header
// (outputPayloadToHeader) — chat-service trusts it rather than re-verifying
// a JWT itself.
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

  const normalized = normalizeGatewayClaims(payload);
  const userId = normalized.accountId;
  if (typeof userId !== "string" || !userId) {
    throw new UnauthorizedError("Authentication token is missing an account id");
  }

  req.account = normalized;
  req.userId = userId;
  req.authToken = header;
  next();
};

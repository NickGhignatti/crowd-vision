import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import { UnauthorizedError } from "../models/error.js";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      // Raw x-gateway-claims header, forwarded verbatim on twin's own
      // outbound calls (e.g. the sensor threshold sync) so the downstream
      // service sees the same caller identity Istio verified at the edge.
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
// {accountId, accountMemberships:[{domainName,role}]} shape every existing
// route already reads — kept as-is post-migration so no downstream route
// handler needed to change, even though the claims are now injected by
// Istio instead of verified in-process.
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
// and injects the validated payload as this base64 header
// (outputPayloadToHeader) — twin trusts it rather than re-verifying a JWT
// itself. A request reaching this pod without a valid claims header could
// not have entered the mesh through the gateway (Phase 1's STRICT mTLS
// blocks any caller that isn't mesh-authenticated), so there is no separate
// spoofing surface to guard against here.
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

  if (!payload.sub) {
    throw new UnauthorizedError("Authentication token is missing an account id");
  }

  req.account = normalizeGatewayClaims(payload);
  req.authToken = header;
  next();
};

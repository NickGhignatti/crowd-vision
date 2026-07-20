import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
    }
  }
}

interface GatewayMembership {
  domain: string;
  role: string;
  externalId?: string;
}

// Maps claims-gateway's StandardClaims onto the legacy {accountId, accountMemberships} shape
// this service reads — see twin-service's identical helper for the full rationale.
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

// Istio validates the gateway JWT at ingress and injects it as this base64 header; we trust
// it rather than re-verifying. Responds directly (no throw) since there's no global error handler.
export const requireAuthentication = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const header = req.headers["x-gateway-claims"];
  if (!header || typeof header !== "string") {
    res.status(401).json({ error: "Missing authentication token" });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as JwtPayload;
  } catch {
    res.status(401).json({ error: "Invalid authentication token" });
    return;
  }

  if (!payload.sub) {
    res.status(401).json({ error: "Invalid authentication token" });
    return;
  }

  req.account = normalizeGatewayClaims(payload);
  next();
};

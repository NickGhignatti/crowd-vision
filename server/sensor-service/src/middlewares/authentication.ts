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

// Istio's RequestAuthentication verifies the gateway JWT once at the ingress
// and injects the validated payload as this base64 header
// (outputPayloadToHeader) — sensor-service trusts it rather than
// re-verifying a JWT itself. Covers both browser (cookie) and internal
// (twin-service forwarding the caller's identity on the threshold sync)
// callers identically, since Istio already normalized both into this header.
//
// Responds directly (rather than throwing) because sensor-service has no
// global error handler — each controller shapes its own response.
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

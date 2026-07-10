import jwt from "jsonwebtoken";
import { getGatewaySigningKey, getGatewayIssuer } from "./config/gatewayJwks.js";

export interface SocketIdentity {
  accountId: string;
  accountName: string;
  domains: string[]; // domainName of each membership
}

const extractIdentity = (p: Record<string, unknown>): SocketIdentity | null => {
  const { accountId, accountName } = p;
  if (typeof accountId !== "string" || typeof accountName !== "string") return null;

  const memberships = Array.isArray(p.accountMemberships) ? p.accountMemberships : [];
  const domains = memberships
    .map((m) => (m as { domainName?: unknown }).domainName)
    .filter((d): d is string => typeof d === "string");

  return { accountId, accountName, domains };
};

interface GatewayMembership {
  domain: string;
  role: string;
}

// Maps claims-gateway's StandardClaims shape onto the legacy
// {accountId, accountMemberships:[{domainName}]} shape extractIdentity reads
// — see twin-service's identical helper for the full rationale.
const normalizeGatewayClaims = (p: jwt.JwtPayload): Record<string, unknown> => ({
  ...p,
  accountId: p.sub,
  accountMemberships: ((p.memberships ?? []) as GatewayMembership[]).map((m) => ({
    domainName: m.domain,
    role: m.role,
  })),
});

/** Verifies the gateway-minted RS256 JWT and extracts identity. Returns null
 * on any failure — a socket handshake either succeeds cleanly or is
 * rejected, there is no partial-identity state. */
export async function authenticateToken(
  token: string | undefined,
): Promise<SocketIdentity | null> {
  if (!token) return null;

  const header = jwt.decode(token, { complete: true })?.header;

  try {
    const key = await getGatewaySigningKey(header?.kid);
    const payload = jwt.verify(token, key, {
      algorithms: ["RS256"],
      issuer: getGatewayIssuer(),
    });
    if (typeof payload === "string") return null;
    return extractIdentity(normalizeGatewayClaims(payload));
  } catch {
    return null;
  }
}

/** Reads one cookie out of a raw Cookie header. No dependency. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }

  return undefined;
}

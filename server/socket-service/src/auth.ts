export interface SocketIdentity {
  accountId: string;
  accountName: string;
  domains: string[];
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

// Maps claims-gateway's StandardClaims onto the legacy {accountId, accountMemberships} shape
// extractIdentity reads — see twin-service's identical helper for the full rationale.
const normalizeGatewayClaims = (p: Record<string, unknown>): Record<string, unknown> => ({
  ...p,
  accountId: p.sub,
  accountMemberships: ((p.memberships ?? []) as GatewayMembership[]).map((m) => ({
    domainName: m.domain,
    role: m.role,
  })),
});

/** Decodes the mesh-injected claims header and extracts identity; returns null on any failure
 * (handshake succeeds cleanly or is rejected, no partial-identity state). Trusts Istio's validated header rather than re-verifying the JWT. */
export function authenticateClaimsHeader(
  header: string | undefined,
): SocketIdentity | null {
  if (!header) return null;

  try {
    const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Record<string, unknown>;
    return extractIdentity(normalizeGatewayClaims(payload));
  } catch {
    return null;
  }
}

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
const normalizeGatewayClaims = (p: Record<string, unknown>): Record<string, unknown> => ({
  ...p,
  accountId: p.sub,
  accountMemberships: ((p.memberships ?? []) as GatewayMembership[]).map((m) => ({
    domainName: m.domain,
    role: m.role,
  })),
});

/** Decodes the mesh-injected claims header and extracts identity. Returns
 * null on any failure — a socket handshake either succeeds cleanly or is
 * rejected, there is no partial-identity state.
 *
 * Istio's RequestAuthentication verifies the gateway JWT once, on the
 * WebSocket upgrade request itself (the handshake is an ordinary HTTP
 * request as far as the mesh is concerned), and injects the validated
 * payload as this base64 header — socket-service trusts it rather than
 * verifying a JWT itself. */
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

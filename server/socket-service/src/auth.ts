import jwt from "jsonwebtoken";

export interface SocketIdentity {
  accountId: string;
  accountName: string;
  domains: string[]; // domainName of each membership
}

/** Verifies the JWT and extracts identity. Returns null on any failure. */
export function authenticateToken(
  token: string | undefined,
  secret: string,
): SocketIdentity | null {
  if (!token || !secret) return null;

  try {
    const p = jwt.verify(token, secret) as Record<string, unknown>;
    const { accountId, accountName } = p;

    if (typeof accountId !== "string" || typeof accountName !== "string")
      return null;

    const memberships = Array.isArray(p.accountMemberships)
      ? p.accountMemberships
      : [];

    const domains = memberships
      .map((m) => (m as { domainName?: unknown }).domainName)
      .filter((d): d is string => typeof d === "string");

    return { accountId, accountName, domains };
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

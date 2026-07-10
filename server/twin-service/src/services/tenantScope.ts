import type { JwtPayload } from "jsonwebtoken";

interface Membership {
  domainName: string;
}

// Domain scope comes solely from the verified JWT (req.account), never from a
// request-supplied domain — trusting req.params/body.domains directly was a
// cross-tenant read (IDOR).
export const memberDomains = (account: JwtPayload | undefined): string[] => {
  const memberships = (account?.accountMemberships ?? []) as Membership[];
  return memberships.map((m) => m.domainName);
};

export const isMemberOf = (
  account: JwtPayload | undefined,
  domain: string,
): boolean => memberDomains(account).includes(domain);

// Bulk queries (counts) silently drop domains the caller isn't a member of
// rather than rejecting the whole request, mirroring Mongo's own `$in` filter.
export const scopeToMemberships = (
  requested: string[],
  account: JwtPayload | undefined,
): string[] => {
  const allowed = new Set(memberDomains(account));
  return requested.filter((d) => allowed.has(d));
};

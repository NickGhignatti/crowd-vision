import type { JwtPayload } from "jsonwebtoken";

interface Membership {
  domainName: string;
  role?: string;
}

// Mirrors client useUserPermissions().canEdit's role list — kept in sync by hand
// since there's no shared role package between the Vue client and this service.
const EDITOR_ROLES = new Set(["business_admin", "business_staff", "admin"]);

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

// Geometry-mutating routes (move/resize/add/delete rooms) require an editing
// role in at least one of the building's own domains — plain membership isn't
// enough, unlike the read-side isMemberOf check.
export const canEditDomains = (
  account: JwtPayload | undefined,
  buildingDomains: string[],
): boolean => {
  const memberships = (account?.accountMemberships ?? []) as Membership[];
  return memberships.some(
    (m) =>
      buildingDomains.includes(m.domainName) &&
      !!m.role &&
      EDITOR_ROLES.has(m.role),
  );
};

// Bulk queries (counts) silently drop domains the caller isn't a member of
// rather than rejecting the whole request, mirroring Mongo's own `$in` filter.
export const scopeToMemberships = (
  requested: string[],
  account: JwtPayload | undefined,
): string[] => {
  const allowed = new Set(memberDomains(account));
  return requested.filter((d) => allowed.has(d));
};

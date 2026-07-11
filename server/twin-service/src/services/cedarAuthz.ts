import { readFileSync } from "fs";
import { join } from "path";
import { isAuthorized } from "@cedar-policy/cedar-wasm/nodejs";
import type { JwtPayload } from "jsonwebtoken";

// server/auth-policy is a sibling of twin-service, not a package dependency
// — read at module load, relative to process.cwd(). CWD-relative (not
// __dirname/import.meta.url) matches this repo's existing convention (see
// sensor-service's `YAML.load("./openapi.yaml")`): twin-service's own
// Jest config transforms to CommonJS, where import.meta is a parse error,
// and npm/Docker both always run this process from the package directory.
const AUTH_POLICY_DIR = join(process.cwd(), "..", "auth-policy");

const schema = readFileSync(join(AUTH_POLICY_DIR, "schema.cedarschema"), "utf8");
const policies = readFileSync(join(AUTH_POLICY_DIR, "policy.cedar"), "utf8");
const roleWeights = JSON.parse(
  readFileSync(join(AUTH_POLICY_DIR, "..", "auth-contracts", "roles.json"), "utf8"),
) as Record<string, number>;

interface GatewayMembership {
  domainName: string;
  role?: string;
}

// Pre-expands raw memberships into the flat per-tier domain sets and max
// role weight policy.cedar reads — see that file's header comment for why
// this expansion happens here, not inside Cedar itself (Cedar's
// `.contains()` can't do role-weight comparison natively).
const accountEntity = (account: JwtPayload | undefined) => {
  const memberships = (account?.accountMemberships ?? []) as GatewayMembership[];
  const domainsAsStandardCustomer: string[] = [];
  const domainsAsBusinessStaff: string[] = [];
  const domainsAsBusinessAdmin: string[] = [];
  const domainsAsAdmin: string[] = [];
  let maxRoleWeight = 0;

  const businessStaffWeight = roleWeights.business_staff ?? Number.POSITIVE_INFINITY;
  const businessAdminWeight = roleWeights.business_admin ?? Number.POSITIVE_INFINITY;
  const adminWeight = roleWeights.admin ?? Number.POSITIVE_INFINITY;

  for (const m of memberships) {
    const weight = m.role ? roleWeights[m.role] : undefined;
    if (weight === undefined) continue;
    if (weight > maxRoleWeight) maxRoleWeight = weight;
    domainsAsStandardCustomer.push(m.domainName);
    if (weight >= businessStaffWeight) domainsAsBusinessStaff.push(m.domainName);
    if (weight >= businessAdminWeight) domainsAsBusinessAdmin.push(m.domainName);
    if (weight >= adminWeight) domainsAsAdmin.push(m.domainName);
  }

  return {
    uid: { type: "Account", id: "caller" },
    attrs: {
      domainsAsStandardCustomer,
      domainsAsBusinessStaff,
      domainsAsBusinessAdmin,
      domainsAsAdmin,
      maxRoleWeight,
    },
    parents: [],
  };
};

const resourceEntity = (domain: string) => ({
  uid: { type: "Resource", id: domain },
  attrs: { domain },
  parents: [],
});

type Action = "Read" | "ReadWithAdminBypass" | "Edit" | "ManageDomain";

const authorize = (
  account: JwtPayload | undefined,
  action: Action,
  domain: string,
): boolean => {
  const principal = accountEntity(account);
  const resource = resourceEntity(domain);
  const answer = isAuthorized({
    principal: principal.uid,
    action: { type: "Action", id: action },
    resource: resource.uid,
    context: {},
    schema,
    policies: { staticPolicies: policies },
    entities: [principal, resource],
  });
  return answer.type === "success" && answer.response.decision === "allow";
};

// Plain domain membership, any role — replaces tenantScope.ts's isMemberOf.
// Deliberately NO admin bypass; a platform admin is not automatically a
// member of every domain.
export const isMemberOf = (account: JwtPayload | undefined, domain: string): boolean =>
  authorize(account, "Read", domain);

// business_staff role or higher in domain — replaces tenantScope.ts's
// canEditDomains (geometry-mutating routes: move/resize/add/delete rooms).
// Cedar only decides one (principal, domain) pair at a time, so this tries
// every one of the building's domains and permits if any qualifies —
// exactly canEditDomains' original "some(...)" semantics.
export const canEditDomains = (
  account: JwtPayload | undefined,
  buildingDomains: string[],
): boolean => buildingDomains.some((domain) => authorize(account, "Edit", domain));

// Bulk queries (counts) silently drop domains the caller isn't a member of
// rather than rejecting the whole request — replaces tenantScope.ts's
// scopeToMemberships, mirroring Mongo's own `$in` filter.
export const scopeToMemberships = (
  requested: string[],
  account: JwtPayload | undefined,
): string[] => requested.filter((domain) => authorize(account, "Read", domain));

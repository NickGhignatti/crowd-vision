import { readFileSync } from "fs";
import { join } from "path";
import { isAuthorized } from "@cedar-policy/cedar-wasm/nodejs";

// Runs the golden fixture shared with every other language binding
// (server/auth-policy/fixtures/conformance.json) through the real cedar-wasm
// engine — the identical-outcomes guarantee that justifies one shared policy
// bundle at all. See src/services/cedarAuthz.ts for the entity shapes and
// why this is CWD-relative, not __dirname/import.meta.url.
const AUTH_POLICY_DIR = join(process.cwd(), "..", "auth-policy");

const schema = readFileSync(join(AUTH_POLICY_DIR, "schema.cedarschema"), "utf8");
const policies = readFileSync(join(AUTH_POLICY_DIR, "policy.cedar"), "utf8");
const roleWeights = JSON.parse(
  readFileSync(join(AUTH_POLICY_DIR, "..", "auth-contracts", "roles.json"), "utf8"),
) as Record<string, number>;

interface ConformanceMembership {
  domain: string;
  role: string;
}

interface ConformanceCase {
  name: string;
  memberships: ConformanceMembership[];
  action: string;
  domain: string;
  context?: { requiredWeight: number };
  expected: "allow" | "deny";
}

const fixture = JSON.parse(
  readFileSync(join(AUTH_POLICY_DIR, "fixtures", "conformance.json"), "utf8"),
) as { cases: ConformanceCase[] };

const accountEntity = (memberships: ConformanceMembership[]) => {
  const domainsAsStandardCustomer: string[] = [];
  const domainsAsBusinessStaff: string[] = [];
  const domainsAsBusinessAdmin: string[] = [];
  const domainsAsAdmin: string[] = [];
  let maxRoleWeight = 0;

  for (const m of memberships) {
    const weight = roleWeights[m.role];
    if (weight === undefined) continue;
    if (weight > maxRoleWeight) maxRoleWeight = weight;
    domainsAsStandardCustomer.push(m.domain);
    if (weight >= roleWeights.business_staff) domainsAsBusinessStaff.push(m.domain);
    if (weight >= roleWeights.business_admin) domainsAsBusinessAdmin.push(m.domain);
    if (weight >= roleWeights.admin) domainsAsAdmin.push(m.domain);
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
  uid: { type: "Resource", id: domain || "global" },
  attrs: { domain },
  parents: [],
});

describe("Cedar conformance (golden fixture, real cedar-wasm engine)", () => {
  it("has fixture cases to run", () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  for (const tc of fixture.cases) {
    it(tc.name, () => {
      const principal = accountEntity(tc.memberships);
      const resource = resourceEntity(tc.domain);
      const answer = isAuthorized({
        principal: principal.uid,
        action: { type: "Action", id: tc.action },
        resource: resource.uid,
        context: tc.context ?? {},
        schema,
        policies: { staticPolicies: policies },
        entities: [principal, resource],
      });
      const decision = answer.type === "success" && answer.response.decision === "allow"
        ? "allow"
        : "deny";
      expect(decision).toBe(tc.expected);
    });
  }
});

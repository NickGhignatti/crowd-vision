import type { JwtPayload } from "jsonwebtoken";
import { canEditDomains } from "../src/services/tenantScope.js";

const accountWith = (
  memberships: { domainName: string; role: string }[],
): JwtPayload => ({ accountMemberships: memberships }) as JwtPayload;

describe("canEditDomains", () => {
  it("allows a business_admin member of one of the building's domains", () => {
    const account = accountWith([{ domainName: "eng", role: "business_admin" }]);
    expect(canEditDomains(account, ["eng"])).toBe(true);
  });

  it("allows a business_staff member", () => {
    const account = accountWith([{ domainName: "eng", role: "business_staff" }]);
    expect(canEditDomains(account, ["eng"])).toBe(true);
  });

  it("allows the platform admin role", () => {
    const account = accountWith([{ domainName: "eng", role: "admin" }]);
    expect(canEditDomains(account, ["eng"])).toBe(true);
  });

  it("denies a standard_customer member", () => {
    const account = accountWith([{ domainName: "eng", role: "standard_customer" }]);
    expect(canEditDomains(account, ["eng"])).toBe(false);
  });

  it("denies an editing role in a domain the building doesn't belong to", () => {
    const account = accountWith([{ domainName: "other", role: "business_admin" }]);
    expect(canEditDomains(account, ["eng"])).toBe(false);
  });

  it("denies when the account has no memberships", () => {
    expect(canEditDomains(undefined, ["eng"])).toBe(false);
  });

  it("denies when the building has no domains", () => {
    const account = accountWith([{ domainName: "eng", role: "business_admin" }]);
    expect(canEditDomains(account, [])).toBe(false);
  });
});

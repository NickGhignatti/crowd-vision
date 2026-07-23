import { describe, it, expect } from "@jest/globals";
import { authenticateClaimsHeader } from "../src/auth.js";

// Signature/issuer/algorithm-confusion attacks are defended once at the Istio ingress; this only
// decodes already-verified claims from the WS upgrade, so those cases aren't retested here (see k8s/istio-request-authentication.yml).
function claimsHeader(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

describe("authenticateClaimsHeader (mesh-injected claims header)", () => {
  it("accepts a valid claims header and maps memberships to domains", () => {
    const header = claimsHeader({
      sub: "acc-1", accountName: "mario", sid: "sid-1",
      memberships: [{ domain: "unibo", role: "standard_customer" }],
    });
    expect(authenticateClaimsHeader(header)).toEqual({
      accountId: "acc-1",
      accountName: "mario",
      domains: ["unibo"],
    });
  });

  it("returns null when accountId or accountName is missing", () => {
    expect(authenticateClaimsHeader(claimsHeader({ accountName: "alice", memberships: [] }))).toBeNull();
    expect(authenticateClaimsHeader(claimsHeader({ sub: "acc-1", memberships: [] }))).toBeNull();
  });

  it("returns null for a header that isn't valid base64-encoded JSON", () => {
    expect(authenticateClaimsHeader("not-valid-base64-json")).toBeNull();
  });

  it("returns null when no header is provided", () => {
    expect(authenticateClaimsHeader(undefined)).toBeNull();
  });

  it("returns empty domains when there are no memberships", () => {
    const header = claimsHeader({ sub: "acc-1", accountName: "alice", memberships: [] });
    expect(authenticateClaimsHeader(header)).toMatchObject({ domains: [] });
  });

  it("drops membership entries without a string domain", () => {
    const header = claimsHeader({
      sub: "acc-1", accountName: "alice",
      memberships: [{ domain: "acme" }, { role: "x" }, {}],
    });
    expect(authenticateClaimsHeader(header)).toMatchObject({ domains: ["acme"] });
  });
});

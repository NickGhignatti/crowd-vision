import express from "express";
import request from "supertest";
import { requireAuthentication } from "../src/middlewares/authentication.js";

function buildApp() {
  const app = express();
  // codeql[js/missing-rate-limiting] -- test-only harness route, never deployed/routed to.
  app.get("/protected", requireAuthentication, (req, res) => {
    res.status(200).json({ account: req.account, userId: req.userId });
  });
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.code ?? 500).json({ error: err.message });
  });
  return app;
}

// Signature/issuer/algorithm-confusion attacks are defended once at the Istio ingress; this
// middleware only decodes already-verified claims, so those cases aren't retested here (see k8s/istio-request-authentication.yml).
function claimsHeader(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

describe("requireAuthentication (mesh-injected claims header)", () => {
  it("rejects a missing claims header", async () => {
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(401);
  });

  it("accepts a valid x-gateway-claims header", async () => {
    const header = claimsHeader({ sub: "acc-1", accountName: "mario", sid: "sid-1", memberships: [] });
    const res = await request(buildApp()).get("/protected").set("x-gateway-claims", header);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("acc-1");
    expect(res.body.account.accountId).toBe("acc-1");
  });

  it("normalizes gateway claims into the legacy accountMemberships/domainName shape", async () => {
    const header = claimsHeader({
      sub: "acc-1", accountName: "mario", sid: "sid-1",
      memberships: [{ domain: "unibo", role: "standard_customer" }],
    });
    const res = await request(buildApp()).get("/protected").set("x-gateway-claims", header);
    expect(res.body.account.accountMemberships).toEqual([{ domainName: "unibo", role: "standard_customer" }]);
  });

  it("rejects a header that isn't valid base64-encoded JSON", async () => {
    const res = await request(buildApp()).get("/protected").set("x-gateway-claims", "not-valid-base64-json");
    expect(res.status).toBe(401);
  });

  it("rejects a well-formed payload missing the account id", async () => {
    const header = claimsHeader({ accountName: "mario", sid: "sid-1", memberships: [] });
    const res = await request(buildApp()).get("/protected").set("x-gateway-claims", header);
    expect(res.status).toBe(401);
  });
});

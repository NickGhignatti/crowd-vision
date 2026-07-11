import { describe, it, expect, beforeEach } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import { requireAuthentication } from "src/middlewares/authentication.ts";

// Signature/issuer/algorithm-confusion attacks are defended once, at the
// Istio ingress (RequestAuthentication) — this middleware only decodes the
// already-verified claims Istio injects, so those cases aren't re-tested
// here (see k8s/istio-request-authentication.yml for the mesh-level config).
function claimsHeader(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

describe("requireAuthentication (mesh-injected claims header)", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    next = jest.fn();
    req = { headers: {} };
    res = { status: statusMock } as unknown as Response;
  });

  it("rejects when no claims header is present", () => {
    requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a header that isn't valid base64-encoded JSON", () => {
    req.headers = { "x-gateway-claims": "not-valid-base64-json" };
    requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a valid claims header and populates req.account", () => {
    req.headers = { "x-gateway-claims": claimsHeader({ sub: "u1", accountName: "alice", memberships: [] }) };
    requireAuthentication(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect((req as Request).account?.accountName).toBe("alice");
  });

  it("normalizes gateway claims into the legacy accountMemberships/domainName shape", () => {
    req.headers = {
      "x-gateway-claims": claimsHeader({
        sub: "acc-1", accountName: "mario", sid: "sid-1",
        memberships: [{ domain: "unibo", role: "standard_customer" }],
      }),
    };
    requireAuthentication(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as Request).account?.accountId).toBe("acc-1");
    expect((req as Request).account?.accountMemberships).toEqual([
      { domainName: "unibo", role: "standard_customer" },
    ]);
  });

  it("rejects a well-formed payload missing the account id", () => {
    req.headers = { "x-gateway-claims": claimsHeader({ accountName: "mario", memberships: [] }) };
    requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

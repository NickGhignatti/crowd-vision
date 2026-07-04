import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { requireAuthentication } from "src/middlewares/authentication.ts";
import { resetGatewayJwksCacheForTests } from "src/config/gatewayJwks.ts";

describe("requireAuthentication (gateway RS256)", () => {
  const GATEWAY_ISSUER = "cv-gateway";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const KID = "test-kid";
  const realFetch = global.fetch;

  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: any;
  let statusMock: any;

  function jwkFromPublicKey() {
    const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
    return { kty: "RSA", kid: KID, use: "sig", alg: "RS256", n: jwk.n, e: jwk.e };
  }
  function signRS256(payload: object, overrides: { iss?: string } = {}) {
    return jwt.sign(payload, privateKey, {
      algorithm: "RS256", keyid: KID,
      issuer: overrides.iss ?? GATEWAY_ISSUER, expiresIn: "1h",
    });
  }

  beforeEach(() => {
    process.env.GATEWAY_JWKS_URI = "http://gateway.test/.well-known/jwks.json";
    process.env.GATEWAY_ISSUER = GATEWAY_ISSUER;
    resetGatewayJwksCacheForTests();
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ keys: [jwkFromPublicKey()] }),
    })) as unknown as typeof fetch;

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    next = jest.fn();
    req = { cookies: {}, headers: {} };
    res = { status: statusMock } as unknown as Response;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("rejects when no token is present", async () => {
    await requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", async () => {
    req.headers = { authorization: "Bearer not-a-token" };
    await requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a valid cookie token and populates req.account", async () => {
    const token = signRS256({ sub: "u1", accountName: "alice", memberships: [] });
    req.cookies = { authentication_token: token };
    await requireAuthentication(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect((req as Request).account?.accountName).toBe("alice");
  });

  it("accepts a forwarded bearer token", async () => {
    const token = signRS256({ sub: "u1", accountName: "svc", memberships: [] });
    req.headers = { authorization: `Bearer ${token}` };
    await requireAuthentication(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it("accepts a gateway-minted token and normalizes claims", async () => {
    const token = signRS256({
      sub: "acc-1", accountName: "mario", sid: "sid-1",
      memberships: [{ domain: "unibo", role: "standard_customer" }],
    });
    req.headers = { authorization: `Bearer ${token}` };
    await requireAuthentication(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as Request).account?.accountId).toBe("acc-1");
    expect((req as Request).account?.accountMemberships).toEqual([
      { domainName: "unibo", role: "standard_customer" },
    ]);
  });

  it("rejects a gateway token from an untrusted issuer", async () => {
    const token = signRS256({ sub: "acc-1", accountName: "mario", memberships: [] }, { iss: "someone-else" });
    req.headers = { authorization: `Bearer ${token}` };
    await requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an HS256 token forged with the gateway's public key as the HMAC secret", async () => {
    const publicPem = publicKey.export({ format: "pem", type: "spki" }) as string;
    const token = jwt.sign({ accountId: "attacker", accountName: "attacker" }, publicPem, {
      algorithm: "HS256",
    });
    req.headers = { authorization: `Bearer ${token}` };
    await requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

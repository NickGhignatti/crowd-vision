import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "crypto";
import { requireAuthentication } from "../src/middlewares/authentication.js";
import { resetGatewayJwksCacheForTests } from "../src/config/gatewayJwks.js";

const GATEWAY_ISSUER = "cv-gateway";
const GATEWAY_JWKS_URI = "http://gateway.test/.well-known/jwks.json";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid";

function jwkFromPublicKey() {
  const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  return { kty: "RSA", kid: KID, use: "sig", alg: "RS256", n: jwk.n, e: jwk.e };
}

function signRS256(payload: object, overrides: { iss?: string; kid?: string } = {}) {
  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    keyid: overrides.kid ?? KID,
    issuer: overrides.iss ?? GATEWAY_ISSUER,
    expiresIn: "1h",
  });
}

function buildApp() {
  const app = express();
  app.get("/protected", requireAuthentication, (req, res) => {
    res.status(200).json({ account: req.account });
  });
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.code ?? 500).json({ error: err.message });
  });
  return app;
}

describe("requireAuthentication (gateway RS256)", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.GATEWAY_JWKS_URI = GATEWAY_JWKS_URI;
    process.env.GATEWAY_ISSUER = GATEWAY_ISSUER;
    resetGatewayJwksCacheForTests();
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ keys: [jwkFromPublicKey()] }),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("accepts a gateway-minted RS256 token", async () => {
    const token = signRS256({ sub: "acc-1", accountName: "mario", sid: "sid-1", memberships: [] });
    const res = await request(buildApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.account.accountId).toBe("acc-1");
  });

  it("normalizes gateway claims into the legacy accountMemberships/domainName shape", async () => {
    const token = signRS256({
      sub: "acc-1", accountName: "mario", sid: "sid-1",
      memberships: [{ domain: "unibo", role: "standard_customer", externalId: "eppn:mario@unibo.it" }],
    });
    const res = await request(buildApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.account.accountMemberships).toEqual([
      { domainName: "unibo", role: "standard_customer", externalId: "eppn:mario@unibo.it" },
    ]);
  });

  it("rejects an RS256 token from an untrusted issuer", async () => {
    const token = signRS256({ sub: "acc-1", accountName: "mario", sid: "sid-1", memberships: [] }, { iss: "someone-elses-gateway" });
    const res = await request(buildApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects an RS256 token signed by an untrusted key", async () => {
    const { privateKey: attackerKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = jwt.sign(
      { sub: "acc-1", accountName: "mario", sid: "sid-1", memberships: [] },
      attackerKey,
      { algorithm: "RS256", keyid: KID, issuer: GATEWAY_ISSUER, expiresIn: "1h" },
    );
    const res = await request(buildApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects an HS256 token forged with the gateway's public key as the HMAC secret", async () => {
    const publicPem = publicKey.export({ format: "pem", type: "spki" }) as string;
    const token = jwt.sign(
      { accountId: "attacker", accountName: "attacker", accountMemberships: [] },
      publicPem,
      { algorithm: "HS256" },
    );
    const res = await request(buildApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects a missing token", async () => {
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(401);
  });
});

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "crypto";
import { authenticateToken, readCookie } from "../src/auth.js";
import { resetGatewayJwksCacheForTests } from "../src/config/gatewayJwks.js";

describe("authenticateToken (gateway RS256)", () => {
  const GATEWAY_ISSUER = "cv-gateway";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const KID = "test-kid";
  const realFetch = global.fetch;

  function jwkFromPublicKey() {
    const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
    return { kty: "RSA", kid: KID, use: "sig", alg: "RS256", n: jwk.n, e: jwk.e };
  }

  function signRS256(payload: object, overrides: { iss?: string } = {}) {
    return jwt.sign(payload, privateKey, {
      algorithm: "RS256",
      keyid: KID,
      issuer: overrides.iss ?? GATEWAY_ISSUER,
      expiresIn: "1h",
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
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("accepts a gateway-minted token and maps memberships to domains", async () => {
    const token = signRS256({
      sub: "acc-1", accountName: "mario", sid: "sid-1",
      memberships: [{ domain: "unibo", role: "standard_customer" }],
    });
    await expect(authenticateToken(token)).resolves.toEqual({
      accountId: "acc-1",
      accountName: "mario",
      domains: ["unibo"],
    });
  });

  it("rejects a gateway token from an untrusted issuer", async () => {
    const token = signRS256({ sub: "acc-1", accountName: "mario", memberships: [] }, { iss: "someone-else" });
    await expect(authenticateToken(token)).resolves.toBeNull();
  });

  it("rejects an HS256 token forged with the gateway's public key as the HMAC secret", async () => {
    const publicPem = publicKey.export({ format: "pem", type: "spki" }) as string;
    const token = jwt.sign({ accountId: "attacker", accountName: "attacker" }, publicPem, { algorithm: "HS256" });
    await expect(authenticateToken(token)).resolves.toBeNull();
  });

  it("rejects a token signed by an untrusted key", async () => {
    const { privateKey: attackerKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = jwt.sign(
      { sub: "acc-1", accountName: "mario", memberships: [] },
      attackerKey,
      { algorithm: "RS256", keyid: KID, issuer: GATEWAY_ISSUER, expiresIn: "1h" },
    );
    await expect(authenticateToken(token)).resolves.toBeNull();
  });

  it("returns null when accountId or accountName is missing", async () => {
    await expect(authenticateToken(signRS256({ accountName: "alice", memberships: [] }))).resolves.toBeNull();
    await expect(authenticateToken(signRS256({ sub: "acc-1", memberships: [] }))).resolves.toBeNull();
  });

  it("returns null for a malformed token", async () => {
    await expect(authenticateToken("not-a-jwt")).resolves.toBeNull();
  });

  it("returns null when no token is provided", async () => {
    await expect(authenticateToken(undefined)).resolves.toBeNull();
  });

  it("returns empty domains when there are no memberships", async () => {
    const token = signRS256({ sub: "acc-1", accountName: "alice", memberships: [] });
    await expect(authenticateToken(token)).resolves.toMatchObject({ domains: [] });
  });

  it("drops membership entries without a string domain", async () => {
    const token = signRS256({
      sub: "acc-1", accountName: "alice",
      memberships: [{ domain: "acme" }, { role: "x" }, {}],
    });
    await expect(authenticateToken(token)).resolves.toMatchObject({ domains: ["acme"] });
  });
});

describe("readCookie", () => {
  it("returns the value of the named cookie", () => {
    const header = "foo=1; authentication_token=abc.def.ghi; bar=2";
    expect(readCookie(header, "authentication_token")).toBe("abc.def.ghi");
  });

  it("url-decodes the cookie value", () => {
    expect(readCookie("k=a%20b", "k")).toBe("a b");
  });

  it("returns undefined when the cookie is absent", () => {
    expect(readCookie("foo=1; bar=2", "authentication_token")).toBeUndefined();
  });

  it("returns undefined when the header is missing", () => {
    expect(readCookie(undefined, "authentication_token")).toBeUndefined();
  });
});

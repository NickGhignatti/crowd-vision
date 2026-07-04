// Shared RS256 token-minting + JWKS-mock helpers for tests that need a
// working authenticated request but aren't themselves testing the JWKS
// verification edge cases (see authentication.test.ts for those).
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "crypto";
import { resetGatewayJwksCacheForTests } from "../src/config/gatewayJwks.js";

export const GATEWAY_ISSUER = "cv-gateway";
export const GATEWAY_JWKS_URI = "http://gateway.test/.well-known/jwks.json";
const KID = "test-kid";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

export function signGatewayToken(payload: object): string {
  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    keyid: KID,
    issuer: GATEWAY_ISSUER,
    expiresIn: "1h",
  });
}

let realFetch: typeof fetch;

export function installGatewayJwksMock(): void {
  process.env.GATEWAY_JWKS_URI = GATEWAY_JWKS_URI;
  process.env.GATEWAY_ISSUER = GATEWAY_ISSUER;
  resetGatewayJwksCacheForTests();
  realFetch = global.fetch;
  const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      keys: [{ kty: "RSA", kid: KID, use: "sig", alg: "RS256", n: jwk.n, e: jwk.e }],
    }),
  })) as unknown as typeof fetch;
}

export function restoreFetch(): void {
  global.fetch = realFetch;
}

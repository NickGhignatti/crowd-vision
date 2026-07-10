import { createPublicKey, type KeyObject } from "crypto";
import { InternalError } from "../models/error.js";

interface JWK {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

export const getGatewayJwksUri = () => {
  const uri = process.env.GATEWAY_JWKS_URI;
  if (!uri) throw new InternalError("Missing GATEWAY_JWKS_URI configuration");
  return uri;
};
export const getGatewayIssuer = () => process.env.GATEWAY_ISSUER || "cv-gateway";

let cache: { keys: Map<string, KeyObject>; fetchedAt: number } | undefined;
const CACHE_TTL_MS = 10 * 60 * 1000;

const loadKeys = async (): Promise<Map<string, KeyObject>> => {
  const res = await fetch(getGatewayJwksUri());
  if (!res.ok) {
    throw new Error(`fetching gateway JWKS failed: ${res.status}`);
  }
  const body = (await res.json()) as { keys: JWK[] };
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys) {
    keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
  }
  return keys;
};

// Minimal, dependency-free JWKS client — see twin-service's identical helper
// for why this doesn't use the jwks-rsa package (ESM/Jest transform clash).
export const getGatewaySigningKey = async (kid: string | undefined): Promise<KeyObject> => {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    cache = { keys: await loadKeys(), fetchedAt: Date.now() };
  }
  const key = kid ? cache.keys.get(kid) : undefined;
  if (!key) throw new Error(`no matching gateway signing key for kid ${kid}`);
  return key;
};

export const resetGatewayJwksCacheForTests = (): void => {
  cache = undefined;
};

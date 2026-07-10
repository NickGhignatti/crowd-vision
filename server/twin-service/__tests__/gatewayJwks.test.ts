import { generateKeyPairSync } from "crypto";
import { getGatewaySigningKey, resetGatewayJwksCacheForTests } from "../src/config/gatewayJwks.js";

const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid";

function jwk() {
  const raw = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  return { kty: "RSA", kid: KID, use: "sig", alg: "RS256", n: raw.n, e: raw.e };
}

describe("getGatewaySigningKey", () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.GATEWAY_JWKS_URI = "http://gateway.test/.well-known/jwks.json";
    resetGatewayJwksCacheForTests();
    fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ keys: [jwk()] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("fetches the JWKS and returns the matching key", async () => {
    const key = await getGatewaySigningKey(KID);
    expect(key).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches the JWKS across calls instead of refetching every time", async () => {
    await getGatewaySigningKey(KID);
    await getGatewaySigningKey(KID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws for an unknown kid", async () => {
    await expect(getGatewaySigningKey("unknown-kid")).rejects.toThrow();
  });

  it("throws when the gateway is unreachable", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    resetGatewayJwksCacheForTests();
    await expect(getGatewaySigningKey(KID)).rejects.toThrow();
  });

  it("throws on a non-2xx response", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    resetGatewayJwksCacheForTests();
    await expect(getGatewaySigningKey(KID)).rejects.toThrow();
  });
});

import { jest } from "@jest/globals";

// The Redis broker is the only side effect — mock it and assert what we publish.
jest.mock("../src/config/redis.js", () => ({
  __esModule: true,
  default: { publish: jest.fn() },
  connectRedis: jest.fn(),
}));

import redisClient from "../src/config/redis.js";
import {
  getGatewayUrl,
  publishNotification,
  sendTemperatureAlert,
} from "../src/services/notificationService.js";

const publish = jest.mocked(redisClient.publish);
const lastPayload = () => JSON.parse(publish.mock.calls.at(-1)?.[1] as string);

beforeEach(() => {
  jest.clearAllMocks();
  publish.mockResolvedValue(1 as never);
});

describe("getGatewayUrl", () => {
  const original = process.env.GATEWAY_URL;
  afterEach(() => {
    process.env.GATEWAY_URL = original;
  });

  it("falls back to localhost when GATEWAY_URL is unset", () => {
    delete process.env.GATEWAY_URL;
    expect(getGatewayUrl()).toBe("http://localhost:3000");
  });

  it("honours GATEWAY_URL when set", () => {
    process.env.GATEWAY_URL = "http://gateway:9999";
    expect(getGatewayUrl()).toBe("http://gateway:9999");
  });
});

describe("publishNotification", () => {
  it("publishes an ISO timestamp and omits domainName by default", async () => {
    await publishNotification("hi", "info");

    expect(publish).toHaveBeenCalledWith("notifications", expect.any(String));
    const payload = lastPayload();
    expect(payload).toMatchObject({ message: "hi", type: "info" });
    expect(payload.domainName).toBeUndefined();
    // ISO string round-trips to the same instant.
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });

  it("includes domainName when provided", async () => {
    await publishNotification("hi", "danger", "domain-1");
    expect(lastPayload().domainName).toBe("domain-1");
  });
});

describe("sendTemperatureAlert", () => {
  it("normalises a Unix-ms number timestamp into an ISO string", async () => {
    const ms = 1_700_000_000_000;
    await sendTemperatureAlert("too hot", ms, "danger");

    const payload = lastPayload();
    expect(payload).toMatchObject({ message: "too hot", type: "danger" });
    expect(payload.timestamp).toBe(new Date(ms).toISOString());
  });

  it("defaults the danger level to info", async () => {
    await sendTemperatureAlert("note", new Date());
    expect(lastPayload().type).toBe("info");
  });
});

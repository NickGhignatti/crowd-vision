import { jest } from "@jest/globals";

// Mock the broker: capture the subscribe callback and watch outbound publishes.
// notificationService (and, through it, pushService) is left REAL so this
// exercises the full inbound edge — Mongoose queries in sendPushToDomain run
// for real against the empty in-memory test database and naturally no-op.
jest.mock("../src/config/redis.js", () => ({
  __esModule: true,
  default: { publish: jest.fn(), get: jest.fn(), set: jest.fn() },
  redisSubscriber: { subscribe: jest.fn() },
  connectRedis: jest.fn(),
}));

import redisClient, { redisSubscriber } from "../src/config/redis.js";
import { initializeEventListeners } from "../src/services/eventListener.js";

type AlertHandler = (message: string) => Promise<void>;

const publish = jest.mocked(redisClient.publish);
const subscribe = jest.mocked(redisSubscriber.subscribe);
const redisGet = jest.mocked(redisClient.get);
const redisSet = jest.mocked(redisClient.set);

const handlerFor = (channel: string): AlertHandler => {
  const call = subscribe.mock.calls.find((c) => c[0] === channel);
  if (!call) throw new Error(`no subscriber registered for ${channel}`);
  return call[1] as unknown as AlertHandler;
};

let fetchSpy: jest.SpiedFunction<typeof fetch>;

beforeEach(() => {
  jest.clearAllMocks();
  publish.mockResolvedValue(1 as never);
  subscribe.mockResolvedValue(undefined as never);
  redisGet.mockResolvedValue(null as never); // no cooldown active by default
  redisSet.mockResolvedValue("OK" as never);
  fetchSpy = jest.spyOn(global, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("initializeEventListeners → alerts:temperature", () => {
  it("resolves the building's domain and publishes a domain-scoped alert", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ["domain-a"],
    } as Response);

    await initializeEventListeners();
    await handlerFor("alerts:temperature")(
      JSON.stringify({
        buildingId: "b1",
        roomId: "r1",
        temperature: 40,
        direction: "high",
        timestamp: 1_700_000_000_000,
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("/domain/b1");

    expect(publish).toHaveBeenCalledTimes(1);
    const [channel, raw] = publish.mock.calls[0] as [string, string];
    expect(channel).toBe("notifications");
    const payload = JSON.parse(raw);
    expect(payload.domainName).toBe("domain-a");
    expect(payload.message).toBe("b1 : r1 is 40°C (above maximum)");
    expect(payload.type).toBe("danger");
  });

  it("phrases a low breach as below minimum", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ["domain-a"],
    } as Response);

    await initializeEventListeners();
    await handlerFor("alerts:temperature")(
      JSON.stringify({
        buildingId: "b1",
        roomId: "r1",
        temperature: 5,
        direction: "low",
        timestamp: Date.now(),
      }),
    );

    const payload = JSON.parse(publish.mock.calls[0]?.[1] as string);
    expect(payload.message).toContain("(below minimum)");
  });

  it("falls back to an unscoped broadcast when the domain can't be resolved", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 502 } as Response);

    await initializeEventListeners();
    await handlerFor("alerts:temperature")(
      JSON.stringify({
        buildingId: "b1",
        roomId: "r1",
        temperature: 40,
        direction: "high",
        timestamp: Date.now(),
      }),
    );

    expect(publish).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(publish.mock.calls[0]?.[1] as string);
    expect(payload.domainName).toBeUndefined();
    expect(payload.message).toBe("b1 : r1 is 40°C (above maximum)");
    // Cooldown still applies to the unscoped fallback, so a stuck sensor
    // can't flood the channel either.
    expect(redisSet).toHaveBeenCalledWith("temp_alert:b1:r1", "1", {
      EX: 300,
    });
  });

  it("skips delivery entirely while the cooldown is active", async () => {
    redisGet.mockResolvedValue("1" as never);

    await initializeEventListeners();
    await handlerFor("alerts:temperature")(
      JSON.stringify({
        buildingId: "b1",
        roomId: "r1",
        temperature: 40,
        direction: "high",
        timestamp: Date.now(),
      }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("sets a 5-minute cooldown keyed by building and room after a successful delivery", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ["domain-a"],
    } as Response);

    await initializeEventListeners();
    await handlerFor("alerts:temperature")(
      JSON.stringify({
        buildingId: "b1",
        roomId: "r1",
        temperature: 40,
        direction: "high",
        timestamp: Date.now(),
      }),
    );

    expect(redisSet).toHaveBeenCalledWith("temp_alert:b1:r1", "1", {
      EX: 300,
    });
  });

  it("swallows malformed messages without publishing", async () => {
    await initializeEventListeners();

    await expect(
      handlerFor("alerts:temperature")("not-json"),
    ).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
  });
});

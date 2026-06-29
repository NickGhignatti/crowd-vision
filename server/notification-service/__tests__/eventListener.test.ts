import { jest } from "@jest/globals";

// Mock the broker: capture the subscribe callback and watch outbound publishes.
// notificationService is left REAL so this exercises the full inbound edge.
jest.mock("../src/config/redis.js", () => ({
  __esModule: true,
  default: { publish: jest.fn() },
  redisSubscriber: { subscribe: jest.fn() },
  connectRedis: jest.fn(),
}));

import redisClient, { redisSubscriber } from "../src/config/redis.js";
import { initializeEventListeners } from "../src/services/eventListener.js";

type AlertHandler = (message: string) => Promise<void>;

const publish = jest.mocked(redisClient.publish);
const subscribe = jest.mocked(redisSubscriber.subscribe);

const handlerFor = (channel: string): AlertHandler => {
  const call = subscribe.mock.calls.find((c) => c[0] === channel);
  if (!call) throw new Error(`no subscriber registered for ${channel}`);
  return call[1] as unknown as AlertHandler;
};

beforeEach(() => {
  jest.clearAllMocks();
  publish.mockResolvedValue(1 as never);
  subscribe.mockResolvedValue(undefined as never);
});

describe("initializeEventListeners → alerts:temperature", () => {
  it("forwards a high breach as a danger notification with an ISO timestamp", async () => {
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

    expect(publish).toHaveBeenCalledTimes(1);
    const [channel, raw] = publish.mock.calls[0] as [string, string];
    expect(channel).toBe("notifications");
    const payload = JSON.parse(raw);
    expect(payload.message).toBe("b1 : r1 is 40°C (above maximum)");
    expect(payload.type).toBe("danger");
    expect(payload.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("phrases a low breach as below minimum", async () => {
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

    expect(JSON.parse(publish.mock.calls[0]?.[1] as string).message).toContain(
      "(below minimum)",
    );
  });

  it("swallows malformed messages without publishing", async () => {
    await initializeEventListeners();

    await expect(
      handlerFor("alerts:temperature")("not-json"),
    ).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
  });
});

import { jest } from "@jest/globals";
import request from "supertest";

jest.mock("../src/config/redis.js", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    set: jest.fn(),
    publish: jest.fn(),
  },
  connectRedis: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
}));

jest.mock("../src/services/notificationService.js", () => ({
  __esModule: true,
  startNotificationLoop: jest.fn(),
  publishNotification: jest.fn(),
  getServerUrl: jest.fn(() => "http://localhost:3000"),
}));

jest.mock("../src/services/pushService.js", () => {
  const actual = jest.requireActual("../src/services/pushService.js") as typeof import("../src/services/pushService.js");
  return {
    ...actual,
    sendPushToDomain: jest.fn<typeof actual.sendPushToDomain>().mockResolvedValue(undefined),
  };
});

import { app } from "../src/index.js";
import redisClient from "../src/config/redis.js";
import NotificationSubscription from "../src/models/notificationSubscription.js";
import { publishNotification } from "../src/services/notificationService.js";
import { sendPushToDomain } from "../src/services/pushService.js";

const mockedPublishNotification = publishNotification as jest.MockedFunction<typeof publishNotification>;
const mockedSendPushToDomain = sendPushToDomain as jest.MockedFunction<typeof sendPushToDomain>;
const mockedRedisClient = redisClient as any;

describe("Notification controller branches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRedisClient.get.mockResolvedValue(null);
    mockedRedisClient.set.mockResolvedValue("OK");
    mockedRedisClient.publish.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns stored notification preferences for an account", async () => {
    await NotificationSubscription.create({
      accountName: "alice",
      domainName: "domain-1",
      preferences: [
        {
          notificationType: "temperature",
          isSubscribed: true,
        },
      ],
    } as any);

    const res = await request(app).get("/preferences/alice");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accountPreferences).toHaveLength(1);
    expect(res.body.accountPreferences[0].domainName).toBe("domain-1");
  });

  it("supports explicit preference arrays", async () => {
    const res = await request(app)
      .post("/preferences")
      .send({
        accountName: "alice",
        domainName: "domain-1",
        preferences: [{ type: "temperature", enabled: false }],
      });

    expect(res.status).toBe(200);

    const preference = await NotificationSubscription.findOne({
      accountName: "alice",
      domainName: "domain-1",
    } as any);

    expect(preference).toBeTruthy();
    expect((preference as any)?.preferences).toEqual([
      expect.objectContaining({
        notificationType: "temperature",
        isSubscribed: false,
      }),
    ]);
  });

  it("rejects a types array when enabled is missing", async () => {
    const res = await request(app)
      .post("/preferences")
      .send({
        accountName: "alice",
        domainName: "domain-1",
        types: ["temperature"],
      });

    expect(res.status).toBe(400);
    expect(res.body.type).toBe("Validation Error");
    expect(res.body.message).toBe("enabled boolean is required when passing a types array");
  });

  it("fans out alerts to multiple domains", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ["domain-a", "domain-b"],
    } as any);

    const res = await request(app)
      .post("/trigger")
      .send({
        message: "Multi-domain alert",
        type: "danger",
        buildingName: "building-1",
        notificationType: "temperature",
      });

    expect(res.status).toBe(200);
    expect(mockedPublishNotification).toHaveBeenCalledTimes(2);
    expect(mockedPublishNotification).toHaveBeenNthCalledWith(1, "Multi-domain alert", "danger", "domain-a");
    expect(mockedPublishNotification).toHaveBeenNthCalledWith(2, "Multi-domain alert", "danger", "domain-b");
    expect(mockedSendPushToDomain).toHaveBeenCalledTimes(2);
  });

  it("returns an internal error when the twin lookup fails", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    } as any);

    const res = await request(app)
      .post("/trigger")
      .send({
        message: "Alert",
        type: "danger",
        buildingName: "building-1",
        notificationType: "temperature",
      });

    expect(res.status).toBe(500);
    expect(res.body.type).toBe("Internal Server Error");
    expect(mockedPublishNotification).not.toHaveBeenCalled();
    expect(mockedSendPushToDomain).not.toHaveBeenCalled();
  });

  it("skips push delivery while cooldown is active", async () => {
    mockedRedisClient.get.mockResolvedValueOnce("1");

    const res = await request(app)
      .post("/push/temperature")
      .send({
        roomId: "A-01",
        buildingId: "building-1",
        domainId: "domain-1",
        temperature: 38,
      });

    expect(res.status).toBe(200);
    expect(mockedPublishNotification).not.toHaveBeenCalled();
    expect(mockedSendPushToDomain).not.toHaveBeenCalled();
    expect(mockedRedisClient.set).not.toHaveBeenCalled();
  });

  it("deduplicates domains before sending temperature pushes", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ["domain-a", "domain-a", "domain-b"],
    } as any);

    const res = await request(app)
      .post("/push/temperature")
      .send({
        buildingId: "building-2",
        temperature: 35,
      });

    expect(res.status).toBe(200);
    expect(mockedPublishNotification).toHaveBeenCalledTimes(2);
    expect(mockedSendPushToDomain).toHaveBeenCalledTimes(2);
    expect(mockedRedisClient.set).toHaveBeenCalledWith(
      "temp_alert:building-2:unknown",
      "1",
      { EX: 300 },
    );
  });
});




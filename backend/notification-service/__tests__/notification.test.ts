import { jest } from "@jest/globals";
import request from "supertest";
import { auth } from "./gatewayTestAuth.js";

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
  publishNotification: jest.fn(), // Verify this is called
  getTwinServiceUrl: jest.fn(() => "http://twin-service:3000"),
}));

jest.mock("../src/services/pushService.js", () => {
  const actual = jest.requireActual(
    "../src/services/pushService.js",
  ) as typeof import("../src/services/pushService.js");
  return {
    ...actual,
    sendPushToDomain: jest
      .fn<typeof actual.sendPushToDomain>()
      .mockResolvedValue(undefined),
  };
});

import { app } from "../src/index.js";
import redisClient from "../src/config/redis.js";
import Subscription from "../src/models/webSubscription.js";
import NotificationSubscription from "../src/models/notificationSubscription.js";
import { publishNotification } from "../src/services/notificationService.js";
import { sendPushToDomain } from "../src/services/pushService.js";

const mockedPublishNotification = publishNotification as jest.MockedFunction<
  typeof publishNotification
>;
const mockedSendPushToDomain = sendPushToDomain as jest.MockedFunction<
  typeof sendPushToDomain
>;
const mockedRedisClient = redisClient as any;

describe("Notification Service API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRedisClient.get.mockResolvedValue(null);
    mockedRedisClient.set.mockResolvedValue("OK");
    mockedRedisClient.publish.mockResolvedValue(1);
  });

  describe("authentication", () => {
    it("rejects subscribe without a token", async () => {
      const res = await request(app).post("/subscribe").send({});
      expect(res.status).toBe(401);
    });
  });

  describe("GET /public-key", () => {
    it("should return the VAPID public key", async () => {
      process.env.VAPID_PUBLIC_KEY = "test-public-key";

      const res = await request(app).get("/public-key");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ publicVapidKey: "test-public-key" });
    });
  });

  describe("POST /subscribe", () => {
    const mockSubscription = {
      domainName: "domain-1",
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
        keys: {
          p256dh: "test-key",
          auth: "test-auth",
        },
      },
    };

    it("should save a new subscription successfully", async () => {
      const res = await auth(request(app).post("/subscribe")).send(
        mockSubscription,
      );

      expect(res.status).toBe(201);

      // Verify DB persistence — account bound from the token, not the body.
      const sub = await Subscription.findOne({
        endpoint: mockSubscription.subscription.endpoint,
      });
      expect(sub).toBeTruthy();
      expect(sub?.accountName).toBe("alice");
      expect(sub?.keys.p256dh).toBe("test-key");

      const preference = await NotificationSubscription.findOne({
        accountName: "alice",
        domainName: mockSubscription.domainName,
      });
      expect(preference).toBeTruthy();
    });

    it("should update existing subscription if endpoint exists", async () => {
      await Subscription.create({
        accountName: "alice",
        endpoint: mockSubscription.subscription.endpoint,
        keys: { p256dh: "old-key", auth: "old-auth" },
      });

      // Send update
      const res = await auth(request(app).post("/subscribe")).send(
        mockSubscription,
      );

      expect(res.status).toBe(201);

      // Verify Update
      const sub = await Subscription.findOne({
        endpoint: mockSubscription.subscription.endpoint,
      });
      expect(sub?.keys.p256dh).toBe("test-key");
    });

    it("should fail with invalid payload", async () => {
      const initialWebSubscriptions = await Subscription.countDocuments();
      const initialPreferences =
        await NotificationSubscription.countDocuments();

      const res = await auth(request(app).post("/subscribe")).send({}); // Empty body

      expect(res.status).toBe(400);
      expect(res.body.type).toBe("Validation Error");
      expect(res.body.message).toBeDefined();

      expect(await Subscription.countDocuments()).toBe(initialWebSubscriptions);
      expect(await NotificationSubscription.countDocuments()).toBe(
        initialPreferences,
      );
    });

    it("should accept flat payload shape without creating preference when domain is missing", async () => {
      const flatPayload = {
        endpoint: "https://fcm.googleapis.com/fcm/send/bob-endpoint",
        keys: {
          p256dh: "bob-key",
          auth: "bob-auth",
        },
      };

      const res = await auth(request(app).post("/subscribe"), "bob").send(
        flatPayload,
      );

      expect(res.status).toBe(201);

      const sub = await Subscription.findOne({
        endpoint: flatPayload.endpoint,
      });
      expect(sub?.accountName).toBe("bob");

      const preference = await NotificationSubscription.findOne({
        accountName: "bob",
      });
      expect(preference).toBeNull();
    });

    it("should remove preference when subscribe payload has enabled=false", async () => {
      await NotificationSubscription.create({
        accountName: "alice",
        domainName: "domain-1",
      });

      const res = await auth(request(app).post("/subscribe")).send({
        domainName: "domain-1",
        enabled: false,
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-2",
          keys: {
            p256dh: "test-key-2",
            auth: "test-auth-2",
          },
        },
      });

      expect(res.status).toBe(201);

      const preference = await NotificationSubscription.findOne({
        accountName: "alice",
        domainName: "domain-1",
      });
      expect(preference).toBeTruthy();
      expect(preference?.preferences).toEqual([
        expect.objectContaining({
          notificationType: "temperature",
          isSubscribed: false,
        }),
      ]);
    });
  });

  describe("POST /preferences", () => {
    it("should allow user to enable domain notifications (upsert)", async () => {
      const res = await auth(request(app).post("/preferences")).send({
        domainName: "domain-1",
        enabled: true,
      });

      expect(res.status).toBe(200);

      const preference = await NotificationSubscription.findOne({
        accountName: "alice",
        domainName: "domain-1",
      });
      expect(preference).toBeTruthy();
    });

    it("should allow user to disable domain notifications", async () => {
      await NotificationSubscription.create({
        accountName: "alice",
        domainName: "domain-1",
      });

      const res = await auth(request(app).post("/preferences")).send({
        domainName: "domain-1",
        enabled: false,
      });

      expect(res.status).toBe(200);

      const preference = await NotificationSubscription.findOne({
        accountName: "alice",
        domainName: "domain-1",
      });
      expect(preference).toBeTruthy();
      expect(preference?.preferences).toEqual([
        expect.objectContaining({
          notificationType: "temperature",
          isSubscribed: false,
        }),
      ]);
    });

    it("should reject invalid preference payload", async () => {
      const res = await auth(request(app).post("/preferences")).send({
        domainName: "domain-1",
      });

      expect(res.status).toBe(400);
      expect(res.body.type).toBe("Validation Error");
      expect(res.body.message).toBe("enabled is required");
    });
  });

  describe("POST /trigger", () => {
    it("should trigger an alert and call publishNotification", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ["domain-1"],
      } as any);

      const payload = {
        message: "High Temperature Detected",
        type: "danger",
        buildingName: "building-1",
        notificationType: "temperature",
      };

      const res = await auth(request(app).post("/trigger")).send(payload);

      expect(res.status).toBe(200);

      expect(mockedPublishNotification).toHaveBeenCalledWith(
        payload.message,
        payload.type,
        "domain-1",
      );
      expect(mockedSendPushToDomain).toHaveBeenCalledWith(
        { title: "CrowdVision Alert", message: payload.message },
        "domain-1",
        "temperature",
      );
    });

    it("should require buildingName", async () => {
      const res = await auth(request(app).post("/trigger")).send({});

      expect(res.status).toBe(400);
      expect(res.body.type).toBe("Validation Error");
      expect(mockedSendPushToDomain).not.toHaveBeenCalled();
    });

    it("should return 500 when publishNotification throws", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ["domain-1"],
      } as any);
      mockedPublishNotification.mockRejectedValueOnce(
        new Error("publish failed"),
      );

      const res = await auth(request(app).post("/trigger")).send({
        message: "x",
        type: "info",
        buildingName: "building-1",
      });

      expect(res.status).toBe(500);
      expect(res.body.type).toBe("Internal Server Error");
      expect(mockedSendPushToDomain).not.toHaveBeenCalled();
    });
  });

  describe("POST /push/temperature", () => {
    it("should send alert using domainId when provided", async () => {
      const payload = {
        roomId: "A-01",
        buildingId: "building-1",
        domainId: "domain-77",
        temperature: 38,
      };

      const res = await auth(request(app).post("/push/temperature")).send(
        payload,
      );

      expect(res.status).toBe(200);
      expect(mockedPublishNotification).toHaveBeenCalledWith(
        "Temperature alert in room A-01: 38 C",
        "danger",
        "domain-77",
      );
      expect(mockedSendPushToDomain).toHaveBeenCalledWith(
        {
          title: "Temperature Alert - building-1",
          message: "Temperature alert in room A-01: 38 C",
        },
        "domain-77",
        "temperature",
      );
    });

    it("should fallback to buildingId when domainId is missing", async () => {
      jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ["domain-from-building"],
      } as any);

      const res = await auth(request(app).post("/push/temperature")).send({
        buildingId: "building-2",
        temperature: 35,
      });

      expect(res.status).toBe(200);
      expect(mockedPublishNotification).toHaveBeenCalledWith(
        "Temperature alert: 35 C",
        "danger",
        "domain-from-building",
      );
      expect(mockedSendPushToDomain).toHaveBeenCalledWith(
        {
          title: "Temperature Alert - building-2",
          message: "Temperature alert: 35 C",
        },
        "domain-from-building",
        "temperature",
      );
    });

    it("should return 400 when both domainId and buildingId are missing", async () => {
      const res = await auth(request(app).post("/push/temperature")).send({
        temperature: 30,
      });

      expect(res.status).toBe(400);
      expect(res.body.type).toBe("Validation Error");
      expect(res.body.message).toBe(
        "domainName/domainId (or buildingId fallback) is required",
      );
      expect(mockedPublishNotification).not.toHaveBeenCalled();
      expect(mockedSendPushToDomain).not.toHaveBeenCalled();
    });
  });
});

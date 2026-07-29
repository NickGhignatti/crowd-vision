import { jest } from "@jest/globals";

// web-push is the transport; mock it so no real notifications go out.
jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

import webpush from "web-push";
import Subscription from "../src/models/webSubscription.js";
import NotificationSubscription, {
  NotificationType,
} from "../src/models/notificationSubscription.js";
import {
  getAccountNotificationPreference,
  sendPushToDomain,
  sendPushToUsers,
  setUserNotificationPreference,
  subscribeUser,
} from "../src/services/pushService.js";

const sendNotification = jest.mocked(webpush.sendNotification);

const subscriptionInput = (overrides: Partial<{ endpoint: string }> = {}) => ({
  endpoint: "https://push.example/ep-1",
  keys: { p256dh: "p", auth: "a" },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  sendNotification.mockResolvedValue(undefined as never);
});

describe("subscribeUser", () => {
  it("upserts a web-push subscription bound to the account", async () => {
    await subscribeUser("alice", subscriptionInput());
    const sub = await Subscription.findOne({ accountName: "alice" });
    expect(sub?.endpoint).toBe("https://push.example/ep-1");
  });
});

describe("setUserNotificationPreference / getAccountNotificationPreference", () => {
  it("creates then reads back a preference", async () => {
    await setUserNotificationPreference(
      "alice",
      "domain-1",
      true,
      NotificationType.TEMPERATURE,
    );
    const [prefDoc] = await getAccountNotificationPreference("alice");
    expect(prefDoc?.preferences).toEqual([
      expect.objectContaining({
        notificationType: "temperature",
        isSubscribed: true,
      }),
    ]);
  });

  it("replaces an existing preference rather than duplicating it", async () => {
    await setUserNotificationPreference("alice", "d1", true, NotificationType.TEMPERATURE);
    await setUserNotificationPreference("alice", "d1", false, NotificationType.TEMPERATURE);
    const [prefDoc] = await getAccountNotificationPreference("alice");
    expect(prefDoc?.preferences).toHaveLength(1);
    expect(prefDoc?.preferences[0]?.isSubscribed).toBe(false);
  });
});

describe("sendPushToUsers", () => {
  it("does nothing when given no account names", async () => {
    await sendPushToUsers({ message: "x" }, []);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing when the accounts have no subscriptions", async () => {
    await sendPushToUsers({ message: "x" }, ["ghost"]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("pushes a payload with sensible defaults to a subscriber", async () => {
    await subscribeUser("alice", subscriptionInput());

    await sendPushToUsers({ message: "hello" }, ["alice"]);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [, raw] = sendNotification.mock.calls[0] as [unknown, string];
    expect(JSON.parse(raw)).toEqual({
      title: "CrowdVision Alert",
      message: "hello",
      icon: "/favicon.ico",
    });
  });

  it("removes a subscription the push gateway reports as gone (410)", async () => {
    await subscribeUser("alice", subscriptionInput());
    sendNotification.mockRejectedValueOnce({ statusCode: 410 } as never);

    await sendPushToUsers({ message: "x" }, ["alice"]);

    expect(await Subscription.findOne({ accountName: "alice" })).toBeNull();
  });

  it("keeps the subscription on a transient push failure", async () => {
    await subscribeUser("alice", subscriptionInput());
    sendNotification.mockRejectedValueOnce({ statusCode: 500 } as never);

    await sendPushToUsers({ message: "x" }, ["alice"]);

    expect(await Subscription.findOne({ accountName: "alice" })).not.toBeNull();
  });
});

describe("sendPushToDomain", () => {
  it("pushes once per account subscribed to the type, deduplicating accounts", async () => {
    await NotificationSubscription.create({
      accountName: "alice",
      domainName: "domain-1",
      preferences: [{ notificationType: "temperature", isSubscribed: true }],
    });
    // Same account, two devices → still one account, two endpoints.
    await subscribeUser("alice", subscriptionInput({ endpoint: "ep-a" }));
    await subscribeUser("alice", subscriptionInput({ endpoint: "ep-b" }));

    await sendPushToDomain(
      { message: "alert" },
      "domain-1",
      NotificationType.TEMPERATURE,
    );

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("skips accounts that disabled the notification type", async () => {
    await NotificationSubscription.create({
      accountName: "bob",
      domainName: "domain-1",
      preferences: [{ notificationType: "temperature", isSubscribed: false }],
    });
    await subscribeUser("bob", subscriptionInput({ endpoint: "ep-bob" }));

    await sendPushToDomain(
      { message: "alert" },
      "domain-1",
      NotificationType.TEMPERATURE,
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });
});

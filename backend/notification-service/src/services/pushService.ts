import webpush from "web-push";
import Subscription from "../models/webSubscription.js";
import NotificationSubscription, {
  NotificationType,
} from "../models/notificationSubscription.js";

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || "";
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || "";

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(
    "mailto:admin@crowdvision.com", // TODO
    publicVapidKey,
    privateVapidKey,
  );
}

type NotificationPayload = {
  title?: string;
  message?: string;
  icon?: string;
};

type WebSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const buildNotificationPayload = (payload: NotificationPayload) =>
  JSON.stringify({
    title: payload.title || "CrowdVision Alert",
    message: payload.message || "New system update.",
    icon: payload.icon || "/favicon.ico",
  });

const sendToSubscriptions = async (
  subscriptions: Array<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>,
  payload: NotificationPayload,
) => {
  const notificationPayload = buildNotificationPayload(payload);

  const promises = subscriptions.map((sub) =>
    webpush
      .sendNotification(sub, notificationPayload)
      .catch(async (err: { statusCode?: number; body?: unknown }) => {
        if (err.statusCode === 410 || err.statusCode === 403) {
          await Subscription.deleteOne({ endpoint: sub.endpoint });
        } else {
          console.error("Push failed:", err.statusCode, err.body);
        }
      }),
  );

  await Promise.all(promises);
};

export const subscribeUser = async (
  accountName: string,
  subscription: WebSubscriptionInput,
) => {
  if (typeof accountName !== "string" || accountName.trim().length === 0) {
    throw new Error("Invalid accountName");
  }
  if (
    typeof subscription.endpoint !== "string" ||
    typeof subscription.keys?.p256dh !== "string" ||
    typeof subscription.keys?.auth !== "string"
  ) {
    throw new Error("Invalid subscription");
  }

  await Subscription.findOneAndUpdate(
    { endpoint: { $eq: subscription.endpoint } },
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      accountName,
    },
    { upsert: true, returnDocument: "after" },
  );
};

export const getAccountNotificationPreference = async (accountName: string) => {
  return NotificationSubscription.find({ accountName: { $eq: accountName } });
};

export const setUserNotificationPreference = async (
  accountName: string,
  domainName: string,
  enabled: boolean,
  type: NotificationType,
) => {
  await NotificationSubscription.updateOne(
    { accountName: { $eq: accountName }, domainName: { $eq: domainName } },
    { $pull: { preferences: { notificationType: type } } },
  );

  await NotificationSubscription.updateOne(
    { accountName: { $eq: accountName }, domainName: { $eq: domainName } },
    {
      $setOnInsert: { accountName, domainName, createdAt: new Date() },
      $push: { preferences: { notificationType: type, isSubscribed: enabled } },
    },
    { upsert: true },
  );
};

export const sendPushToUsers = async (
  payload: NotificationPayload,
  accountNames: string[],
) => {
  if (accountNames.length === 0) {
    return;
  }

  const subscriptions = await Subscription.find({
    accountName: { $in: accountNames },
  }).lean();

  if (subscriptions.length === 0) {
    return;
  }

  await sendToSubscriptions(subscriptions, payload);
};

export const sendPushToDomain = async (
  payload: NotificationPayload,
  domainName: string,
  type: NotificationType,
) => {
  const domainSubscriptions = await NotificationSubscription.find({
    domainName: { $eq: domainName },
    preferences: {
      $elemMatch: { notificationType: type, isSubscribed: true },
    },
  }).lean();
  const accountNames = [
    ...new Set(
      domainSubscriptions.map((subscription) => subscription.accountName),
    ),
  ];
  await sendPushToUsers(payload, accountNames);
};

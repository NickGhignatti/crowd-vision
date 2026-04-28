import type { Request, Response } from "express";
import {
  getServerUrl,
  publishNotification,
} from "../services/notificationService.js";
import {
  getAccountNotificationPreference,
  sendPushToDomain,
  setUserNotificationPreference,
  subscribeUser,
} from "../services/pushService.js";
import { ValidationError } from "../models/error.js";
import redisClient from "../config/redis.js";
import { NotificationType } from "../models/notificationSubscription.js";

type SubscriptionRequestBody = {
  accountName?: string;
  userId?: string;
  domainName?: string;
  domainId?: string;
  // Legacy / single updates
  enabled?: boolean;
  type?: NotificationType;
  types?: NotificationType[]; // e.g. ["temperature", "air_quality"]
  preferences?: { type: NotificationType; enabled: boolean }[]; // e.g. [{type: "temperature", enabled: true}]
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

type IncomingSubscription = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

const isValidSubscription = (subscription: IncomingSubscription) =>
  Boolean(
    subscription.endpoint &&
      subscription.keys?.p256dh &&
      subscription.keys?.auth,
  );

const getAccountName = (body: { accountName?: string; userId?: string }) =>
  body.accountName || body.userId;

const getDomainName = (body: { domainName?: string; domainId?: string }) =>
  body.domainName || body.domainId;

const getDomainsForBuilding = async (buildingName: string) => {
  const response = await fetch(
    `${getServerUrl()}/twin/domain/${encodeURIComponent(buildingName)}`,
  );

  if (!response.ok) {
    throw new Error(`Twin lookup failed for building ${buildingName}`);
  }

  return (await response.json()) as string[];
};

export const triggerAlert = async (req: Request, res: Response) => {
  const { message, type, buildingName, notificationType } = req.body as {
    message?: string;
    type?: string;
    buildingName?: string;
    notificationType: NotificationType;
  };

  const normalizedMessage = message || "Manual Alert Triggered";
  const normalizedType = type || "alert";

  if (!buildingName) {
    throw new ValidationError("Missing required field: buildingName");
  }

  const domains = await getDomainsForBuilding(buildingName);

  for (const domainName of domains) {
    await publishNotification(normalizedMessage, normalizedType, domainName);

    if (domainName) {
      await sendPushToDomain(
        { title: "CrowdVision Alert", message: normalizedMessage },
        domainName,
        notificationType,
      );
    }
  }

  res.status(200).json({ success: true, message: "Notification sent" });
};

export const publicKey = async (_req: Request, res: Response) => {
  const publicVapidKey = process.env.VAPID_PUBLIC_KEY || "";
  res.status(200).json({ publicVapidKey });
};

export const subscribe = async (req: Request, res: Response) => {
  const body = req.body as SubscriptionRequestBody;
  const accountName = getAccountName(body);
  const domainName = getDomainName(body);
  const subscription: IncomingSubscription = body.subscription?.endpoint
    ? body.subscription
    : {
        ...(body.endpoint ? { endpoint: body.endpoint } : {}),
        ...(body.keys ? { keys: body.keys } : {}),
      };

  if (!accountName) {
    throw new ValidationError("Missing required field: accountName");
  }

  if (!isValidSubscription(subscription)) {
    throw new ValidationError("Invalid push subscription payload");
  }

  await subscribeUser(accountName, {
    endpoint: subscription.endpoint as string,
    keys: {
      p256dh: subscription.keys?.p256dh as string,
      auth: subscription.keys?.auth as string,
    },
  });

  if (domainName) {
    if (body.preferences && body.preferences.length > 0) {
      await Promise.all(
        body.preferences.map((pref) =>
          setUserNotificationPreference(
            accountName,
            domainName,
            pref.enabled,
            pref.type,
          ),
        ),
      );
    } else if (body.types && body.types.length > 0) {
      const isEnabled = body.enabled !== false;
      await Promise.all(
        body.types.map((type) =>
          setUserNotificationPreference(
            accountName,
            domainName,
            isEnabled,
            type,
          ),
        ),
      );
    } else {
      // 3. Fallback for backwards compatibility (Single insert)
      await setUserNotificationPreference(
        accountName,
        domainName,
        body.enabled !== false,
        NotificationType.TEMPERATURE,
      );
    }
  }

  res.status(201).json({ success: true });
};

export const getPreferences = async (req: Request, res: Response) => {
  const { accountName } = req.params;

  if (!accountName) {
    throw new ValidationError("Missing required field: accountName");
  }

  const accountPreferences = await getAccountNotificationPreference(
    accountName as string,
  );

  res.status(200).json({ success: true, accountPreferences });
};

export const updatePreference = async (req: Request, res: Response) => {
  const body = req.body as SubscriptionRequestBody;

  const accountName = getAccountName(body);
  const domainName = getDomainName(body);

  if (!accountName || !domainName) {
    throw new ValidationError(
      "accountName/userId and domainName/domainId are required",
    );
  }

  if (body.preferences && body.preferences.length > 0) {
    await Promise.all(
      body.preferences.map((pref) =>
        setUserNotificationPreference(
          accountName,
          domainName,
          pref.enabled,
          pref.type,
        ),
      ),
    );
  } else if (body.types && body.types.length > 0) {
    if (typeof body.enabled !== "boolean") {
      throw new ValidationError(
        "enabled boolean is required when passing a types array",
      );
    }
    await Promise.all(
      body.types.map((type) =>
        setUserNotificationPreference(
          accountName,
          domainName,
          body.enabled as boolean,
          type,
        ),
      ),
    );
  } else {
    if (typeof body.enabled !== "boolean") {
      throw new ValidationError("enabled is required");
    }
    const type = body.type || NotificationType.TEMPERATURE;
    await setUserNotificationPreference(
      accountName,
      domainName,
      body.enabled,
      type,
    );
  }

  res.status(200).json({ success: true });
};

export const pushTemperatureAlert = async (req: Request, res: Response) => {
  const body = req.body as {
    roomId?: string;
    buildingId?: string;
    temperature?: number;
    domainName?: string;
    domainId?: string;
    type?: NotificationType;
  };

  const { roomId, buildingId, temperature } = body;
  const notificationType = body.type || NotificationType.TEMPERATURE;

  const cacheKey = `temp_alert:${buildingId || "unknown"}:${roomId || "unknown"}`;
  const COOLDOWN_SECONDS = 300;

  const isCooldownActive = await redisClient.get(cacheKey);
  if (isCooldownActive) {
    res.status(200).json({
      success: true,
    });
    return;
  }

  const directDomainName = getDomainName(body);

  const targetDomainNames = directDomainName
    ? [directDomainName]
    : buildingId
      ? await getDomainsForBuilding(buildingId)
      : [];

  const uniqueDomainNames = [...new Set(targetDomainNames.filter(Boolean))];

  if (uniqueDomainNames.length === 0) {
    throw new ValidationError(
      "domainName/domainId (or buildingId fallback) is required",
    );
  }

  const message = `Temperature alert${roomId ? ` in room ${roomId}` : ""}: ${temperature ?? "N/A"} C`;

  for (const domainName of uniqueDomainNames) {
    await publishNotification(message, "danger", domainName);
    await sendPushToDomain(
      {
        title: `Temperature Alert${buildingId ? ` - ${buildingId}` : ""}`,
        message,
      },
      domainName,
      notificationType,
    );
  }

  await redisClient.set(cacheKey, "1", { EX: COOLDOWN_SECONDS });

  res.status(200).json({ success: true });
};

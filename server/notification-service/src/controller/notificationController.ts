import type { Request, Response } from 'express';
import {
  getServerUrl,
  publishNotification,
} from "../services/notificationService.js";
import {
  getAccountNotificationPreference,
  sendPushToDomain,
  setUserNotificationPreference,
  subscribeUser,
} from '../services/pushService.js';
import { ValidationError } from '../models/error.js';

type SubscriptionRequestBody = {
  accountName?: string;
  userId?: string;
  domainName?: string;
  domainId?: string;
  enabled?: boolean;
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
  const response = await fetch(`${getServerUrl()}/twin/domain/${encodeURIComponent(buildingName)}`);

  if (!response.ok) {
    throw new Error(`Twin lookup failed for building ${buildingName}`);
  }

  return (await response.json()) as string[];
};

export const triggerAlert = async (req: Request, res: Response) => {
  const { message, type, buildingName } = req.body as {
    message?: string;
    type?: string;
    buildingName?: string;
  };

  console.log("__" + message);

  const normalizedMessage = message || 'Manual Alert Triggered';
  const normalizedType = type || 'alert';

  if (!buildingName) {
    throw new ValidationError('Missing required field: buildingName');
  }

  const domains = await getDomainsForBuilding(buildingName);

  for (const domainName of domains) {
    await publishNotification(normalizedMessage, normalizedType, domainName);

    if (domainName) {
      await sendPushToDomain(
        { title: "CrowdVision Alert", message: normalizedMessage },
        domainName,
      );
    }
  }

  res.status(200).json({ success: true, message: 'Notification sent' });
};


export const publicKey = async (_req: Request, res: Response) => {
    const publicVapidKey = process.env.VAPID_PUBLIC_KEY || ''
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
    throw new ValidationError('Missing required field: accountName');
  }

  if (!isValidSubscription(subscription)) {
    throw new ValidationError('Invalid push subscription payload');
  }

  await subscribeUser(accountName, {
    endpoint: subscription.endpoint as string,
    keys: {
      p256dh: subscription.keys?.p256dh as string,
      auth: subscription.keys?.auth as string,
    },
  });

  if (domainName) {
    await setUserNotificationPreference(
      accountName,
      domainName,
      body.enabled !== false,
    );
  }

  res.status(201).json({ success: true });
};

export const getPreferences = async (req: Request, res: Response) => {
  const { accountName } = req.params;

  if (!accountName) {
    throw new ValidationError('Missing required field: accountName');
  }

  const accountPreferences = await getAccountNotificationPreference(accountName as string);

  res.status(200).json({ success: true, accountPreferences });
}

export const updatePreference = async (req: Request, res: Response) => {
  const body = req.body as {
    accountName?: string;
    userId?: string;
    domainName?: string;
    domainId?: string;
    enabled?: boolean;
  };

  const accountName = getAccountName(body);
  const domainName = getDomainName(body);
  const { enabled } = body;

  if (!accountName || !domainName || typeof enabled !== 'boolean') {
    throw new ValidationError('accountName/userId, domainName/domainId and enabled are required');
  }

  await setUserNotificationPreference(accountName, domainName, enabled);

  res.status(200).json({ success: true });
};

export const pushTemperatureAlert = async (req: Request, res: Response) => {
  const body = req.body as {
    roomId?: string;
    buildingId?: string;
    temperature?: number;
    domainName?: string;
    domainId?: string;
  };

  const { roomId, buildingId, temperature } = body;
  const directDomainName = getDomainName(body);

  const targetDomainNames = directDomainName
    ? [directDomainName]
    : buildingId
      ? await getDomainsForBuilding(buildingId)
      : [];

  const uniqueDomainNames = [...new Set(targetDomainNames.filter(Boolean))];

  if (uniqueDomainNames.length === 0) {
    throw new ValidationError('domainName/domainId (or buildingId fallback) is required');
  }

  const message = `Temperature alert${roomId ? ` in room ${roomId}` : ''}: ${temperature ?? 'N/A'} C`;

  for (const domainName of uniqueDomainNames) {
    await publishNotification(message, 'danger', domainName);
    await sendPushToDomain(
      {
        title: `Temperature Alert${buildingId ? ` - ${buildingId}` : ''}`,
        message,
      },
      domainName,
    );
  }

  res.status(200).json({ success: true });

}
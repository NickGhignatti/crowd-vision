import type { Request, Response } from 'express';
import { publishNotification } from '../services/notificationService.js';
import {
  getAccountNotificationPreference,
  sendPushToDomain,
  setUserNotificationPreference,
  subscribeUser,
} from '../services/pushService.js';
import { ValidationError } from '../models/error.js';

type SubscriptionRequestBody = {
  accountName?: string;
  domainName?: string;
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

export const triggerAlert = async (req: Request, res: Response) => {
  const { message, type, domainName } = req.body as {
    message?: string;
    type?: string;
    domainName?: string;
  };

  const normalizedMessage = message || 'Manual Alert Triggered';
  const normalizedType = type || 'alert';

  await publishNotification(normalizedMessage, normalizedType, domainName);

  if (domainName) {
    await sendPushToDomain(
      { title: 'CrowdVision Alert', message: normalizedMessage },
      domainName,
    );
  }

  res.status(200).json({ success: true, message: 'Notification sent' });
};


export const publicKey = async (_req: Request, res: Response) => {
    const publicVapidKey = process.env.VAPID_PUBLIC_KEY || ''
    res.status(200).json({ publicVapidKey });
};

export const subscribe = async (req: Request, res: Response) => {
  const body = req.body as SubscriptionRequestBody;
  const accountName = body.accountName;
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

  if (body.domainName) {
    await setUserNotificationPreference(
      accountName,
      body.domainName,
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
  const { accountName, domainName, enabled } = req.body as {
    accountName?: string;
    domainName?: string;
    enabled?: boolean;
  };

  if (!accountName || !domainName || typeof enabled !== 'boolean') {
    throw new ValidationError('accountName, domainName and enabled are required');
  }

  await setUserNotificationPreference(accountName, domainName, enabled);

  res.status(200).json({ success: true });
};

export const pushTemperatureAlert = async (req: Request, res: Response) => {
  const { roomId, buildingId, temperature, domainName } = req.body as {
    roomId?: string;
    buildingId?: string;
    temperature?: number;
    domainName?: string;
  };

  const targetdomainName = domainName || buildingId;

  if (!targetdomainName) {
    throw new ValidationError('domainName (or buildingId fallback) is required');
  }

  const message = `Temperature alert${roomId ? ` in room ${roomId}` : ''}: ${temperature ?? 'N/A'} C`;

  await publishNotification(message, 'danger', targetdomainName);
  await sendPushToDomain(
    {
      title: `Temperature Alert${buildingId ? ` - ${buildingId}` : ''}`,
      message,
    },
    targetdomainName,
  );

  res.status(200).json({ success: true });

}
import type { Request, Response } from 'express';
import { publishNotification } from '../services/notificationService.js';
import {
  sendPushToDomain,
  setUserNotificationPreference,
  subscribeUser,
} from '../services/pushService.js';
import { ValidationError } from '../models/error.js';

type SubscriptionRequestBody = {
  userId?: string;
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

export const triggerAlert = async (req: Request, res: Response) => {
  const { message, type, domainId } = req.body as {
    message?: string;
    type?: string;
    domainId?: string;
  };

  const normalizedMessage = message || 'Manual Alert Triggered';
  const normalizedType = type || 'alert';

  await publishNotification(normalizedMessage, normalizedType, domainId);

  if (domainId) {
    await sendPushToDomain(
      { title: 'CrowdVision Alert', message: normalizedMessage },
      domainId,
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
  const userId = body.userId;
  const subscription: IncomingSubscription = body.subscription?.endpoint
    ? body.subscription
    : {
      ...(body.endpoint ? { endpoint: body.endpoint } : {}),
      ...(body.keys ? { keys: body.keys } : {}),
    };

  if (!userId) {
    throw new ValidationError('Missing required field: userId');
  }

  if (!isValidSubscription(subscription)) {
    throw new ValidationError('Invalid push subscription payload');
  }

  await subscribeUser(userId, {
    endpoint: subscription.endpoint as string,
    keys: {
      p256dh: subscription.keys?.p256dh as string,
      auth: subscription.keys?.auth as string,
    },
  });

  if (body.domainId) {
    await setUserNotificationPreference(
      userId,
      body.domainId,
      body.enabled !== false,
    );
  }

  res.status(201).json({ success: true });
};

export const updatePreference = async (req: Request, res: Response) => {
  const { userId, domainId, enabled } = req.body as {
    userId?: string;
    domainId?: string;
    enabled?: boolean;
  };

  if (!userId || !domainId || typeof enabled !== 'boolean') {
    throw new ValidationError('userId, domainId and enabled are required');
  }

  await setUserNotificationPreference(userId, domainId, enabled);

  res.status(200).json({ success: true });
};

export const pushTemperatureAlert = async (req: Request, res: Response) => {
  const { roomId, buildingId, temperature, domainId } = req.body as {
    roomId?: string;
    buildingId?: string;
    temperature?: number;
    domainId?: string;
  };

  const targetDomainId = domainId || buildingId;

  if (!targetDomainId) {
    throw new ValidationError('domainId (or buildingId fallback) is required');
  }

  const message = `Temperature alert${roomId ? ` in room ${roomId}` : ''}: ${temperature ?? 'N/A'} C`;

  await publishNotification(message, 'danger', targetDomainId);
  await sendPushToDomain(
    {
      title: `Temperature Alert${buildingId ? ` - ${buildingId}` : ''}`,
      message,
    },
    targetDomainId,
  );

  res.status(200).json({ success: true });

}
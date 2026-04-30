import redisClient from '../config/redis.js';
import { sendPushToDomain } from './pushService.js';
import { NotificationType } from "../models/notificationSubscription.js";

export const getServerUrl = () =>
  process.env.VITE_SERVER_URL || "http://localhost:3000";

export const publishNotification = async (
  message: string,
  type: string = "info",
  domainName?: string,
) => {
  const payload: {
    id: string;
    message: string;
    type: string;
    timestamp: Date;
    domainName?: string;
  } = {
    id: Date.now().toString(),
    message,
    type,
    timestamp: new Date(),
  };

  if (domainName) {
    payload.domainName = domainName;
  }

  await redisClient.publish("notifications", JSON.stringify(payload));
};

export const startNotificationLoop = () => {
    const demoDomainId = process.env.DEMO_NOTIFICATION_DOMAIN_ID;

    setInterval(async () => {
        await publishNotification(`System Status Check: ${new Date().toLocaleTimeString()}`, 'info');
        if (demoDomainId) {
            await sendPushToDomain({ title: 'Critical Alert', message: 'HALLO' }, demoDomainId, NotificationType.TEMPERATURE);
        }
    }, 10000);
};
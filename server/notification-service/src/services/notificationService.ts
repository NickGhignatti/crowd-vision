import redisClient from '../config/redis.js';
import { sendPushToDomain } from './pushService.js';

export const getServerUrl = () =>
  process.env.VITE_SERVER_URL || "http://localhost:3000";

export const publishNotification = async (
    message: string,
    type: string = 'info',
    domainId?: string,
) => {
  const payload: {
    id: string;
    message: string;
    type: string;
    timestamp: Date;
    domainId?: string;
  } = {
    id: Date.now().toString(),
    message,
    type,
    timestamp: new Date(),
  };

  // TODO: fetch all domains and foreach domain I should send a notification to every user subscribed to that domain
  await fetch(`${getServerUrl()}/twin/`);

  if (domainId) {
    payload.domainId = domainId;
  }

  await redisClient.publish("notifications", JSON.stringify(payload));
};

export const startNotificationLoop = () => {
    const demoDomainId = process.env.DEMO_NOTIFICATION_DOMAIN_ID;

    setInterval(async () => {
        await publishNotification(`System Status Check: ${new Date().toLocaleTimeString()}`, 'info');
        if (demoDomainId) {
            await sendPushToDomain({ title: 'Critical Alert', message: 'HALLO' }, demoDomainId);
        }
    }, 10000);
};
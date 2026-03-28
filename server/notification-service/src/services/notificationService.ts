import redisClient from '../config/redis.js';
import {sendPushToAll} from "./pushService.js";

export const publishNotification = async (message: string, type: string = 'info') => {
    const payload = {
        id: Date.now().toString(),
        message,
        type,
        timestamp: new Date()
    };

    await redisClient.publish('notifications', JSON.stringify(payload));
};

export const startNotificationLoop = () => {
    setInterval(async () => {
        await publishNotification(`System Status Check: ${new Date().toLocaleTimeString()}`, 'info');
        await sendPushToAll({ title: 'Critical Alert', message: "HALLO" })
    }, 10000);
};
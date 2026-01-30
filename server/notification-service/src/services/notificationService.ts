import redisClient from '../config/redis.js';

export const publishNotification = async (message: string, type: string = 'info') => {
    try {
        const payload = {
            id: Date.now().toString(),
            message,
            type,
            timestamp: new Date()
        };

        await redisClient.publish('notifications', JSON.stringify(payload));
        console.log(`📤 Published: ${message}`);
    } catch (error) {
        console.error('Error publishing notification:', error);
    }
};

export const startNotificationLoop = () => {
    console.log('⏰ Starting 10-second notification loop...');

    setInterval(async () => {
        await publishNotification(`System Status Check: ${new Date().toLocaleTimeString()}`, 'info');
    }, 10000);
};
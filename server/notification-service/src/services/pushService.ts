import webpush from 'web-push';
import Subscription from '../models/subscription.js';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || ''
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || ''

webpush.setVapidDetails(
    'mailto:admin@crowdvision.com', // TODO
    publicVapidKey,
    privateVapidKey
);

export const subscribeUser = async (subscription: any) => {
    const newSub = new Subscription(subscription);
    await newSub.save();
};

export const sendPushToAll = async (payload: any) => {
    const subscriptions = await Subscription.find();

    if (subscriptions.length === 0) {
        console.log('⚠️ No users subscribed! (Check DB connection or collection name)');
        return;
    }

    const notificationPayload = JSON.stringify({
        title: payload.title || 'CrowdVision Alert',
        message: payload.message || 'New system update.',
        icon: '/favicon.ico'
    });

    const promises = subscriptions.map(sub =>
        webpush.sendNotification(sub, notificationPayload)
            .catch(async err => {
                if (err.statusCode === 410 || err.statusCode === 403) {
                    console.warn(`🗑️ Removing invalid subscription: ${sub.endpoint.slice(0, 20)}...`);
                    await Subscription.deleteOne({_id: sub._id});
                } else {
                    console.error("❌ Push Failed for user:", err.statusCode, err.body);
                }
            })
    );

    await Promise.all(promises);
};
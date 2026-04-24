import webpush from 'web-push';
import Subscription from '../models/webSubscription.js';
import NotificationSubscription from '../models/notificationSubscription.js';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || ''
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || ''

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails(
        'mailto:admin@crowdvision.com', // TODO
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

const buildNotificationPayload = (payload: NotificationPayload) => JSON.stringify({
    title: payload.title || 'CrowdVision Alert',
    message: payload.message || 'New system update.',
    icon: payload.icon || '/favicon.ico',
});

const sendToSubscriptions = async (
    subscriptions: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
    payload: NotificationPayload,
) => {
    const notificationPayload = buildNotificationPayload(payload);

    const promises = subscriptions.map((sub) =>
        webpush.sendNotification(sub, notificationPayload)
            .catch(async (err: { statusCode?: number; body?: unknown }) => {
                if (err.statusCode === 410 || err.statusCode === 403) {
                    console.warn(`Removing invalid subscription: ${sub.endpoint.slice(0, 20)}...`);
                    await Subscription.deleteOne({ endpoint: sub.endpoint });
                } else {
                    console.error('Push failed:', err.statusCode, err.body);
                }
            }),
    );

    await Promise.all(promises);
};

export const subscribeUser = async (userId: string, subscription: WebSubscriptionInput) => {
    await Subscription.findOneAndUpdate(
        { endpoint: subscription.endpoint },
        { ...subscription, userId },
        { upsert: true, returnDocument: 'after' },
    );
};

export const setUserNotificationPreference = async (
    userId: string,
    domainId: string,
    enabled: boolean,
) => {
    if (enabled) {
        await NotificationSubscription.findOneAndUpdate(
            { userId, domainId },
            { userId, domainId },
            { upsert: true, returnDocument: 'after' },
        );
        return;
    }

    await NotificationSubscription.deleteOne({ userId, domainId });
};

export const sendPushToUsers = async (payload: NotificationPayload, userIds: string[]) => {
    if (userIds.length === 0) {
        return;
    }

    const subscriptions = await Subscription.find({ userId: { $in: userIds } }).lean();

    if (subscriptions.length === 0) {
        return;
    }

    await sendToSubscriptions(subscriptions, payload);
};

export const sendPushToDomain = async (payload: NotificationPayload, domainId: string) => {
    const domainSubscriptions = await NotificationSubscription.find({ domainId }).lean();
    const userIds = [...new Set(domainSubscriptions.map((subscription) => subscription.userId))];

    await sendPushToUsers(payload, userIds);
};


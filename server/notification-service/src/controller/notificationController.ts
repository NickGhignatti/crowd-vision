import type { Request, Response } from 'express';
import { publishNotification } from '../services/notificationService.js';
import Subscription from '../models/subscription.js'

export const triggerAlert = async (req: Request, res: Response) => {
    const { message, type } = req.body;

    await publishNotification(message || 'Manual Alert Triggered', type || 'alert');

    res.status(200).json({ success: true, message: 'Notification sent to Gateway and Push Service' });
};


export const publicKey = async (req: Request, res: Response) => {
    const publicVapidKey = process.env.VAPID_PUBLIC_KEY || ''
    res.status(200).json({ publicVapidKey });
};

export const subscribe = async (req: Request, res: Response) => {
    try {
        const subscription = req.body;

        if (!subscription || !subscription.endpoint) {
            res.status(400).json({ error: 'Invalid subscription payload' });
            return;
        }

        await Subscription.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            subscription,
            { upsert: true, new: true }
        );

        console.log('✅ User subscribed successfully');
        res.status(201).json({ success: true });
    } catch (error) {
        console.error('❌ Subscribe Error:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
};
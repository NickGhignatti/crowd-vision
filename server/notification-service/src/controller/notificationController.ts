import type { Request, Response } from 'express';
import { publishNotification } from '../services/notificationService.js';
import Subscription from '../models/subscription.js'
import {ValidationError} from "../models/error.js";

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
    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
        // throw new ValidationError("Invalid subscription object received");
      res.status(400).send();
    }

    await Subscription.findOneAndUpdate(
        { endpoint: subscription.endpoint },
        subscription,
        { upsert: true, returnDocument: 'after' }
    );

    res.status(201).json({ success: true });
};
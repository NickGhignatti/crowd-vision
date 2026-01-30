import type {Request, Response} from 'express';
import { publishNotification } from '../services/notificationService.js';

export const triggerAlert = async (req: Request, res: Response) => {
    const { message, type } = req.body;

    await publishNotification(message || 'Manual Alert Triggered', type || 'alert');

    res.status(200).json({ success: true, message: 'Notification sent to Gateway' });
};
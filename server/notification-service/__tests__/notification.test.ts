import { jest } from '@jest/globals';
import request from 'supertest';

jest.mock('../src/config/redis.js', () => ({
    connectRedis: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/services/notificationService.js', () => ({
    startNotificationLoop: jest.fn(),
    publishNotification: jest.fn() // We verify this is called
}));

import { app } from '../src/index.js';
import Subscription from '../src/models/subscription.js';
import { publishNotification } from '../src/services/notificationService.js';

describe('Notification Service API', () => {
    describe('GET /public-key', () => {
        it('should return the VAPID public key', async () => {
            process.env.VAPID_PUBLIC_KEY = 'test-public-key';

            const res = await request(app).get('/public-key');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ publicVapidKey: 'test-public-key' });
        });
    });

    describe('POST /subscribe', () => {
        const mockSubscription = {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
            keys: {
                p256dh: 'test-key',
                auth: 'test-auth'
            }
        };

        it('should save a new subscription successfully', async () => {
            const res = await request(app)
                .post('/subscribe')
                .send(mockSubscription);

            expect(res.status).toBe(201);

            // Verify DB persistence
            const sub = await Subscription.findOne({ endpoint: mockSubscription.endpoint });
            expect(sub).toBeTruthy();
            expect(sub?.keys.p256dh).toBe('test-key');
        });

        it('should update existing subscription if endpoint exists', async () => {
            await Subscription.create({
                ...mockSubscription,
                keys: { p256dh: 'old-key', auth: 'old-auth' }
            });

            // Send update
            const res = await request(app)
                .post('/subscribe')
                .send(mockSubscription);

            expect(res.status).toBe(201);

            // Verify Update
            const sub = await Subscription.findOne({ endpoint: mockSubscription.endpoint });
            expect(sub?.keys.p256dh).toBe('test-key');
        });

        it('should fail with invalid payload', async () => {
            const res = await request(app)
                .post('/subscribe')
                .send({}); // Empty body

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/invalid/i);
        });
    });

    describe('POST /trigger', () => {
        it('should trigger an alert and call publishNotification', async () => {
            const payload = {
                message: 'High Temperature Detected',
                type: 'danger'
            };

            const res = await request(app)
                .post('/trigger')
                .send(payload);

            expect(res.status).toBe(200);

            // Check if service function was called
            expect(publishNotification).toHaveBeenCalledWith(payload.message, payload.type);
        });

        it('should use defaults if fields are missing', async () => {
            const res = await request(app)
                .post('/trigger')
                .send({});

            expect(res.status).toBe(200);

            expect(publishNotification).toHaveBeenCalledWith(
                'Manual Alert Triggered',
                'alert'
            );
        });
    });
});
import { jest } from '@jest/globals';
import request from 'supertest';

jest.mock('../src/config/redis.js', () => ({
    connectRedis: jest.fn<() => Promise<boolean>>().mockResolvedValue(true)
}));

jest.mock('../src/services/notificationService.js', () => ({
    startNotificationLoop: jest.fn(),
    publishNotification: jest.fn() // Verify this is called
}));

jest.mock('../src/services/pushService.js', () => {
    const actual = jest.requireActual('../src/services/pushService.js') as typeof import('../src/services/pushService.js');
    return {
        ...actual,
        sendPushToDomain: jest.fn<typeof actual.sendPushToDomain>().mockResolvedValue(undefined),
    };
});

import { app } from '../src/index.js';
import Subscription from '../src/models/webSubscription.js';
import NotificationSubscription from '../src/models/notificationSubscription.js';
import { publishNotification } from '../src/services/notificationService.js';
import { sendPushToDomain } from '../src/services/pushService.js';

const mockedPublishNotification = publishNotification as jest.MockedFunction<typeof publishNotification>;
const mockedSendPushToDomain = sendPushToDomain as jest.MockedFunction<typeof sendPushToDomain>;

describe('Notification Service API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

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
            userId: 'alice',
            domainId: 'domain-1',
            subscription: {
                endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
                keys: {
                    p256dh: 'test-key',
                    auth: 'test-auth'
                }
            }
        };

        it('should save a new subscription successfully', async () => {
            const res = await request(app)
                .post('/subscribe')
                .send(mockSubscription);

            expect(res.status).toBe(201);

            // Verify DB persistence
            const sub = await Subscription.findOne({ endpoint: mockSubscription.subscription.endpoint });
            expect(sub).toBeTruthy();
            expect(sub?.userId).toBe(mockSubscription.userId);
            expect(sub?.keys.p256dh).toBe('test-key');

            const preference = await NotificationSubscription.findOne({
                userId: mockSubscription.userId,
                domainId: mockSubscription.domainId,
            });
            expect(preference).toBeTruthy();
        });

        it('should update existing subscription if endpoint exists', async () => {
            await Subscription.create({
                userId: 'alice',
                endpoint: mockSubscription.subscription.endpoint,
                keys: { p256dh: 'old-key', auth: 'old-auth' }
            });

            // Send update
            const res = await request(app)
                .post('/subscribe')
                .send(mockSubscription);

            expect(res.status).toBe(201);

            // Verify Update
            const sub = await Subscription.findOne({ endpoint: mockSubscription.subscription.endpoint });
            expect(sub?.keys.p256dh).toBe('test-key');
        });

        it('should fail with invalid payload', async () => {
            const initialWebSubscriptions = await Subscription.countDocuments();
            const initialPreferences = await NotificationSubscription.countDocuments();

            const res = await request(app)
                .post('/subscribe')
                .send({}); // Empty body

            expect(res.status).toBe(400);
            expect(res.body.type).toBe('Validation Error');
            expect(res.body.message).toBeDefined();

            expect(await Subscription.countDocuments()).toBe(initialWebSubscriptions);
            expect(await NotificationSubscription.countDocuments()).toBe(initialPreferences);
        });

        it('should accept flat payload shape without creating preference when domain is missing', async () => {
            const flatPayload = {
                userId: 'bob',
                endpoint: 'https://fcm.googleapis.com/fcm/send/bob-endpoint',
                keys: {
                    p256dh: 'bob-key',
                    auth: 'bob-auth',
                },
            };

            const res = await request(app)
                .post('/subscribe')
                .send(flatPayload);

            expect(res.status).toBe(201);

            const sub = await Subscription.findOne({ endpoint: flatPayload.endpoint });
            expect(sub?.userId).toBe(flatPayload.userId);

            const preference = await NotificationSubscription.findOne({ userId: flatPayload.userId });
            expect(preference).toBeNull();
        });

        it('should remove preference when subscribe payload has enabled=false', async () => {
            await NotificationSubscription.create({ userId: 'alice', domainId: 'domain-1' });

            const res = await request(app)
                .post('/subscribe')
                .send({
                    userId: 'alice',
                    domainId: 'domain-1',
                    enabled: false,
                    subscription: {
                        endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-2',
                        keys: {
                            p256dh: 'test-key-2',
                            auth: 'test-auth-2',
                        },
                    },
                });

            expect(res.status).toBe(201);

            const preference = await NotificationSubscription.findOne({ userId: 'alice', domainId: 'domain-1' });
            expect(preference).toBeNull();
        });
    });

    describe('POST /preferences', () => {
        it('should allow user to enable domain notifications (upsert)', async () => {
            const res = await request(app)
                .post('/preferences')
                .send({ userId: 'alice', domainId: 'domain-1', enabled: true });

            expect(res.status).toBe(200);

            const preference = await NotificationSubscription.findOne({ userId: 'alice', domainId: 'domain-1' });
            expect(preference).toBeTruthy();
        });

        it('should allow user to disable domain notifications', async () => {
            await NotificationSubscription.create({ userId: 'alice', domainId: 'domain-1' });

            const res = await request(app)
                .post('/preferences')
                .send({ userId: 'alice', domainId: 'domain-1', enabled: false });

            expect(res.status).toBe(200);

            const preference = await NotificationSubscription.findOne({ userId: 'alice', domainId: 'domain-1' });
            expect(preference).toBeNull();
        });

        it('should reject invalid preference payload', async () => {
            const res = await request(app)
                .post('/preferences')
                .send({ userId: 'alice', domainId: 'domain-1' });

            expect(res.status).toBe(400);
            expect(res.body.type).toBe('Validation Error');
            expect(res.body.message).toBe('userId, domainId and enabled are required');
        });
    });

    describe('POST /trigger', () => {
        it('should trigger an alert and call publishNotification', async () => {
            const payload = {
                message: 'High Temperature Detected',
                type: 'danger',
                domainId: 'domain-1',
            };

            const res = await request(app)
                .post('/trigger')
                .send(payload);

            expect(res.status).toBe(200);

            // Check if service function was called
            expect(mockedPublishNotification).toHaveBeenCalledWith(payload.message, payload.type, payload.domainId);
            expect(mockedSendPushToDomain).toHaveBeenCalledWith(
                { title: 'CrowdVision Alert', message: payload.message },
                payload.domainId,
            );
        });

        it('should use defaults if fields are missing', async () => {
            const res = await request(app)
                .post('/trigger')
                .send({});

            expect(res.status).toBe(200);

            expect(mockedPublishNotification).toHaveBeenCalledWith(
                'Manual Alert Triggered',
                'alert',
                undefined,
            );
            expect(mockedSendPushToDomain).not.toHaveBeenCalled();
        });

        it('should return 500 when publishNotification throws', async () => {
            mockedPublishNotification.mockRejectedValueOnce(new Error('publish failed'));

            const res = await request(app)
                .post('/trigger')
                .send({ message: 'x', type: 'info', domainId: 'domain-1' });

            expect(res.status).toBe(500);
            expect(res.body.type).toBe('Internal Server Error');
            expect(mockedSendPushToDomain).not.toHaveBeenCalled();
        });
    });

    describe('POST /push/temperature', () => {
        it('should send alert using domainId when provided', async () => {
            const payload = {
                roomId: 'A-01',
                buildingId: 'building-1',
                domainId: 'domain-77',
                temperature: 38,
            };

            const res = await request(app)
                .post('/push/temperature')
                .send(payload);

            expect(res.status).toBe(200);
            expect(mockedPublishNotification).toHaveBeenCalledWith(
                'Temperature alert in room A-01: 38 C',
                'danger',
                'domain-77',
            );
            expect(mockedSendPushToDomain).toHaveBeenCalledWith(
                {
                    title: 'Temperature Alert - building-1',
                    message: 'Temperature alert in room A-01: 38 C',
                },
                'domain-77',
            );
        });

        it('should fallback to buildingId when domainId is missing', async () => {
            const res = await request(app)
                .post('/push/temperature')
                .send({ buildingId: 'building-2', temperature: 35 });

            expect(res.status).toBe(200);
            expect(mockedPublishNotification).toHaveBeenCalledWith(
                'Temperature alert: 35 C',
                'danger',
                'building-2',
            );
            expect(mockedSendPushToDomain).toHaveBeenCalledWith(
                {
                    title: 'Temperature Alert - building-2',
                    message: 'Temperature alert: 35 C',
                },
                'building-2',
            );
        });

        it('should return 400 when both domainId and buildingId are missing', async () => {
            const res = await request(app)
                .post('/push/temperature')
                .send({ temperature: 30 });

            expect(res.status).toBe(400);
            expect(res.body.type).toBe('Validation Error');
            expect(res.body.message).toBe('domainId (or buildingId fallback) is required');
            expect(mockedPublishNotification).not.toHaveBeenCalled();
            expect(mockedSendPushToDomain).not.toHaveBeenCalled();
        });
    });
});
import request from 'supertest';
import { app } from '../src/index.js';
import mongoose from 'mongoose';
import { Building } from '../src/models/twin.js';

const mockBuilding = {
    id: 'Building-Test-001',
    domains: ['test-domain'],
    rooms: [
        {
            id: 'Room-101',
            capacity: 20,
            temperature: 22,
            no_person: 0,
            position: { x: 0, y: 0, z: 0 },
            dimensions: { width: 10, height: 10, depth: 10 },
            color: '#ffffff'
        }
    ]
};

describe('Twin Service API', () => {
    describe('POST /register', () => {
        it('should register a new building successfully', async () => {
            const res = await request(app)
                .post('/register')
                .send(mockBuilding);

            expect(res.status).toBe(201);
            expect(res.body.id).toBe(mockBuilding.id);
            expect(res.body.rooms).toHaveLength(1);

            const inDb = await Building.findOne({ id: mockBuilding.id });
            expect(inDb).toBeTruthy();
        });

        it('should fail if building already exists', async () => {
            await new Building(mockBuilding).save();

            const res = await request(app)
                .post('/register')
                .send(mockBuilding);

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/exists/i);
        });
    });

    describe('GET /building/:id', () => {
        it('should retrieve a building by ID', async () => {
            await new Building(mockBuilding).save();

            const res = await request(app).get(`/building/${mockBuilding.id}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(mockBuilding.id);
        });

        it('should return 404 if building not found', async () => {
            const res = await request(app).get('/building/NON_EXISTENT');
            expect(res.status).toBe(404);
        });
    });

    describe('GET /buildings/:domain', () => {
        it('should retrieve buildings for a specific domain', async () => {
            await new Building(mockBuilding).save();
            await new Building({ ...mockBuilding, id: 'Building-2' }).save();

            const res = await request(app).get(`/buildings/${mockBuilding.domains[0]}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThanOrEqual(2);
        });

        it('should return 404 if no buildings found for domain', async () => {
            const res = await request(app).get('/buildings/unknown-domain');
            expect(res.status).toBe(404);
        });
    });

    describe('PATCH /building/:buildingId/room/:roomId', () => {
        beforeEach(async () => {
            await new Building(mockBuilding).save();
        });

        it('should update room details (capacity & color)', async () => {
            const updates = {
                capacity: 50,
                color: '#ff0000'
            };

            const res = await request(app)
                .patch(`/building/${mockBuilding.id}/room/Room-101`)
                .send(updates);

            expect(res.status).toBe(200);
            expect(res.body.capacity).toBe(50);
            expect(res.body.color).toBe('#ff0000');

            const updatedBuilding = await Building.findOne({ id: mockBuilding.id });
            const room = updatedBuilding?.rooms.find(r => r.id === 'Room-101');
            expect(room?.capacity).toBe(50);
        });

        it('should return 400 if building not found', async () => {
            const res = await request(app)
                .patch('/building/FAKE_BUILDING/room/Room-101')
                .send({ capacity: 50 });

            expect(res.status).toBe(400);
        });

        it('should return 400 if room not found', async () => {
            const res = await request(app)
                .patch(`/building/${mockBuilding.id}/room/FAKE_ROOM`)
                .send({ capacity: 50 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/room not found/i);
        });
    });
});
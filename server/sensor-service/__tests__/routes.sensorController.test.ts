import request from 'supertest';
import { jest } from '@jest/globals';
import type {
    postPeopleCountSignal,
    postTemperatureSignal,
    postAirQualitySignal,
    getLatestsPeopleCountSignal,
    getLatestsTemperatureSignal,
    getLatestsAirQualitySignal,
    getAllLatestsPeopleCountSignal,
    getAllLatestsTemperatureSignal,
    getAllLatestsAirQualitySignal,
} from '../src/services/sensorService.js';
import type {
    getPeopleCountData,
    getTemperatureData,
    getAirQualityData,
} from '../src/services/dashboardService.js';
import type { checkTemperature } from '../src/services/alertingService.js';

const sensorServiceMocks = {
    postPeopleCountSignal: jest.fn<typeof postPeopleCountSignal>(),
    postTemperatureSignal: jest.fn<typeof postTemperatureSignal>(),
    postAirQualitySignal: jest.fn<typeof postAirQualitySignal>(),
    getLatestsPeopleCountSignal: jest.fn<typeof getLatestsPeopleCountSignal>(),
    getLatestsTemperatureSignal: jest.fn<typeof getLatestsTemperatureSignal>(),
    getLatestsAirQualitySignal: jest.fn<typeof getLatestsAirQualitySignal>(),
    getAllLatestsPeopleCountSignal: jest.fn<typeof getAllLatestsPeopleCountSignal>(),
    getAllLatestsTemperatureSignal: jest.fn<typeof getAllLatestsTemperatureSignal>(),
    getAllLatestsAirQualitySignal: jest.fn<typeof getAllLatestsAirQualitySignal>()
};

const dashboardServiceMocks = {
    getPeopleCountData: jest.fn<typeof getPeopleCountData>(),
    getTemperatureData: jest.fn<typeof getTemperatureData>(),
    getAirQualityData: jest.fn<typeof getAirQualityData>()
};

const alertingServiceMocks = {
    checkTemperature: jest.fn<typeof checkTemperature>(),
};

jest.unstable_mockModule('../src/services/sensorService.js', () => sensorServiceMocks);
jest.unstable_mockModule('../src/services/dashboardService.js', () => dashboardServiceMocks);
jest.unstable_mockModule('../src/services/alertingService.js', () => alertingServiceMocks);

const { app } = await import('../src/index.js');

describe('sensor routes and controller integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('creates people count signal', async () => {
        sensorServiceMocks.postPeopleCountSignal.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/peopleCount')
            .send({ buildingId: 'building-api-1', roomId: 'room-1', timestamp: 1000, peopleCount: 11 });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ message: 'People count signal created' });
        expect(sensorServiceMocks.postPeopleCountSignal).toHaveBeenCalledWith('building-api-1', 'room-1', 1000, 11);
    });

    it('returns 400 when people count service throws', async () => {
        sensorServiceMocks.postPeopleCountSignal.mockRejectedValue(new Error('Invalid payload'));

        const res = await request(app)
            .post('/peopleCount')
            .send({ buildingId: 'building-api-1', roomId: 'room-1' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    it('creates temperature signal', async () => {
        sensorServiceMocks.postTemperatureSignal.mockResolvedValue(undefined);
        alertingServiceMocks.checkTemperature.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/temperature')
            .send({ buildingId: 'building-api-2', roomId: 'room-1', timestamp: 1000, temperature: 22.5 });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ message: 'Temperature signal created' });
        expect(sensorServiceMocks.postTemperatureSignal).toHaveBeenCalledWith('building-api-2', 'room-1', 1000, 22.5);
        expect(alertingServiceMocks.checkTemperature).toHaveBeenCalledWith('building-api-2', 'room-1', 22.5);
    });

    it('creates air quality signal', async () => {
        sensorServiceMocks.postAirQualitySignal.mockResolvedValue(undefined);

        const res = await request(app)
            .post('/air-quality')
            .send({
                buildingId: 'building-api-aq',
                roomId: 'room-1',
                timestamp: 1000,
                scenario: 'clean_indoor',
                pm25: 4.1,
                pm10: 7.8,
                co2: 520,
                voc: 120,
                temperature: 21.1,
                humidity: 44,
                aqi: 25,
                indoor_aqi: 55.5
            });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ message: 'Air quality signal created' });
        expect(sensorServiceMocks.postAirQualitySignal).toHaveBeenCalledWith(
            'building-api-aq',
            'room-1',
            1000,
            'clean_indoor',
            4.1,
            7.8,
            520,
            120,
            21.1,
            44,
            25,
            55.5
        );
    });

    it('returns latest people count for a room', async () => {
        sensorServiceMocks.getLatestsPeopleCountSignal.mockResolvedValue({
            building: 'building-api-3',
            roomId: 'room-1',
            timestamp: 2000,
            peopleCount: 7
        } as unknown as Awaited<ReturnType<typeof getLatestsPeopleCountSignal>>);

        const res = await request(app)
            .get('/peopleCount')
            .query({ building: 'building-api-3', roomId: 'room-1' });

        expect(res.status).toBe(200);
        expect(res.body.peopleCount).toHaveProperty('peopleCount', 7);
        expect(res.body.peopleCount).toHaveProperty('roomId', 'room-1');
        expect(sensorServiceMocks.getLatestsPeopleCountSignal).toHaveBeenCalledWith('building-api-3', 'room-1');
    });

    it('returns latest temperature for a room', async () => {
        sensorServiceMocks.getLatestsTemperatureSignal.mockResolvedValue({
            building: 'building-api-4',
            roomId: 'room-1',
            timestamp: 2000,
            temperature: 23.1
        } as unknown as Awaited<ReturnType<typeof getLatestsTemperatureSignal>>);

        const res = await request(app)
            .get('/temperature')
            .query({ building: 'building-api-4', roomId: 'room-1' });

        expect(res.status).toBe(200);
        expect(res.body.temperature).toHaveProperty('temperature', 23.1);
        expect(res.body.temperature).toHaveProperty('roomId', 'room-1');
        expect(sensorServiceMocks.getLatestsTemperatureSignal).toHaveBeenCalledWith('building-api-4', 'room-1');
    });

    it('returns latest air quality for a room', async () => {
        sensorServiceMocks.getLatestsAirQualitySignal.mockResolvedValue({
            building: 'building-api-aq-2',
            roomId: 'room-1',
            timestamp: 2000,
            aqi: 32
        } as unknown as Awaited<ReturnType<typeof getLatestsAirQualitySignal>>);

        const res = await request(app)
            .get('/air-quality')
            .query({ building: 'building-api-aq-2', roomId: 'room-1' });

        expect(res.status).toBe(200);
        expect(res.body.airQuality).toHaveProperty('aqi', 32);
        expect(res.body.airQuality).toHaveProperty('roomId', 'room-1');
        expect(sensorServiceMocks.getLatestsAirQualitySignal).toHaveBeenCalledWith('building-api-aq-2', 'room-1');
    });

    it('returns all latest people count values for a building', async () => {
        sensorServiceMocks.getAllLatestsPeopleCountSignal.mockResolvedValue([
            { roomId: 'room-a', value: 2, timestamp: 2000, building: 'building-api-5' },
            { roomId: 'room-b', value: 6, timestamp: 1500, building: 'building-api-5' }
        ]);

        const res = await request(app)
            .get('/peopleCount/entireBuilding')
            .query({ building: 'building-api-5' });

        expect(res.status).toBe(200);
        expect(res.body.peopleCount).toHaveLength(2);
        expect(sensorServiceMocks.getAllLatestsPeopleCountSignal).toHaveBeenCalledWith('building-api-5');
    });

    it('returns all latest air quality values for a building', async () => {
        sensorServiceMocks.getAllLatestsAirQualitySignal.mockResolvedValue([
            { roomId: 'room-a', aqi: 12, timestamp: 2000, building: 'building-api-8' },
            { roomId: 'room-b', aqi: 22, timestamp: 1500, building: 'building-api-8' }
        ]);

        const res = await request(app)
            .get('/air-quality/entireBuilding')
            .query({ building: 'building-api-8' });

        expect(res.status).toBe(200);
        expect(res.body.airQuality).toHaveLength(2);
        expect(sensorServiceMocks.getAllLatestsAirQualitySignal).toHaveBeenCalledWith('building-api-8');
    });

    it('returns people count dashboard data for room and for entire building', async () => {
        dashboardServiceMocks.getPeopleCountData.mockResolvedValue([{ timestamp: new Date(), avg: 6, sum: 12 }]);

        const roomRes = await request(app)
            .get('/peopleCount/dashboard')
            .query({ building: 'building-api-6', roomId: 'room-a', timeRange: '1D' });

        expect(roomRes.status).toBe(200);
        expect(roomRes.body.peopleCount.length).toBeGreaterThan(0);
        expect(dashboardServiceMocks.getPeopleCountData).toHaveBeenCalledWith('building-api-6', '1D', 'room-a');

        const buildingRes = await request(app)
            .get('/peopleCount/dashboard/entireBuilding')
            .query({ building: 'building-api-6', timeRange: '1D' });

        expect(buildingRes.status).toBe(200);
        expect(buildingRes.body.peopleCount.length).toBeGreaterThan(0);
        expect(dashboardServiceMocks.getPeopleCountData).toHaveBeenCalledWith('building-api-6', '1D', undefined);
    });

    it('returns temperature dashboard data for room and for entire building', async () => {
        dashboardServiceMocks.getTemperatureData.mockResolvedValue([{ timestamp: new Date(), avg: 21.5, sum: 43 }]);

        const roomRes = await request(app)
            .get('/temperature/dashboard')
            .query({ building: 'building-api-7', roomId: 'room-a', timeRange: '1W' });

        expect(roomRes.status).toBe(200);
        expect(roomRes.body.temperature.length).toBeGreaterThan(0);
        expect(dashboardServiceMocks.getTemperatureData).toHaveBeenCalledWith('building-api-7', '1W', 'room-a');

        const buildingRes = await request(app)
            .get('/temperature/dashboard/entireBuilding')
            .query({ building: 'building-api-7', timeRange: '1W' });

        expect(buildingRes.status).toBe(200);
        expect(buildingRes.body.temperature.length).toBeGreaterThan(0);
        expect(dashboardServiceMocks.getTemperatureData).toHaveBeenCalledWith('building-api-7', '1W', undefined);
    });

    it('returns air quality dashboard data for room and for entire building', async () => {
        dashboardServiceMocks.getAirQualityData.mockResolvedValue([{ timestamp: new Date(), avg: 35, sum: 70 }]);

        const roomRes = await request(app)
            .get('/air-quality/dashboard')
            .query({ building: 'building-api-9', roomId: 'room-a', timeRange: '1W' });

        expect(roomRes.status).toBe(200);
        expect(roomRes.body.airQuality.length).toBeGreaterThan(0);
        expect(dashboardServiceMocks.getAirQualityData).toHaveBeenCalledWith('building-api-9', '1W', 'room-a');

        const buildingRes = await request(app)
            .get('/air-quality/dashboard/entireBuilding')
            .query({ building: 'building-api-9', timeRange: '1W' });

        expect(buildingRes.status).toBe(200);
        expect(buildingRes.body.airQuality.length).toBeGreaterThan(0);
        expect(dashboardServiceMocks.getAirQualityData).toHaveBeenCalledWith('building-api-9', '1W', undefined);
    });

    it('returns 400 when downstream services fail', async () => {
        sensorServiceMocks.getAllLatestsTemperatureSignal.mockRejectedValue(new Error('boom'));

        const res = await request(app)
            .get('/temperature/entireBuilding')
            .query({ building: 'building-api-err' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'boom');
    });
});

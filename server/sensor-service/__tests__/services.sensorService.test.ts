import {
    postPeopleCountSignal,
    postTemperatureSignal,
    postAirQualitySignal,
    getLatestsPeopleCountSignal,
    getLatestsTemperatureSignal,
    getLatestsAirQualitySignal,
    getAllLatestsPeopleCountSignal,
    getAllLatestsTemperatureSignal,
    getAllLatestsAirQualitySignal
} from '../src/services/sensorService.js';
import { PeopleCount } from '../src/models/peopleCountSignal.js';
import { Temperature } from '../src/models/temperatureSignal.js';
import { AirQuality } from '../src/models/airQualitySignal.js';
import { jest } from '@jest/globals';

describe('sensorService', () => {
    it('creates people count signal with expected payload', async () => {
        const createSpy = jest.spyOn(PeopleCount, 'create').mockResolvedValue({} as any);

        await postPeopleCountSignal('t1', 'r1', 1000, 5);

        expect(createSpy).toHaveBeenCalledWith({
            building: 't1',
            roomId: 'r1',
            timestamp: 1000,
            peopleCount: 5
        });
    });

    it('creates temperature signal with expected payload', async () => {
        const createSpy = jest.spyOn(Temperature, 'create').mockResolvedValue({} as any);

        await postTemperatureSignal('t1', 'r1', 1000, 20.1);

        expect(createSpy).toHaveBeenCalledWith({
            building: 't1',
            roomId: 'r1',
            timestamp: 1000,
            temperature: 20.1
        });
    });

    it('creates air quality signal with expected payload', async () => {
        const createSpy = jest.spyOn(AirQuality, 'create').mockResolvedValue({} as any);

        await postAirQualitySignal('t1', 'r1', 1000, 'clean', 4.5, 8.2, 500, 120, 21.3, 45, 32, 60.5);

        expect(createSpy).toHaveBeenCalledWith({
            building: 't1',
            roomId: 'r1',
            timestamp: 1000,
            scenario: 'clean',
            pm25: 4.5,
            pm10: 8.2,
            co2: 500,
            voc: 120,
            temperature: 21.3,
            humidity: 45,
            aqi: 32,
            indoor_aqi: 60.5
        });
    });

    it('returns latest people count signal', async () => {
        const expected = { peopleCount: 7, timestamp: 2000 };
        const exec = jest.fn<() => Promise<any>>().mockResolvedValue(expected);
        const sort = jest.fn().mockReturnValue({ exec });
        const findOne = jest.spyOn(PeopleCount, 'findOne').mockReturnValue({ sort } as any);

        const latest = await getLatestsPeopleCountSignal('t1', 'r1');

        expect(findOne).toHaveBeenCalledWith({ building: 't1', roomId: 'r1' });
        expect(sort).toHaveBeenCalledWith({ timestamp: -1 });
        expect(latest).toEqual(expected);
    });

    it('throws when latest people count signal does not exist', async () => {
        const exec = jest.fn<() => Promise<any>>().mockResolvedValue(null);
        const sort = jest.fn().mockReturnValue({ exec });
        jest.spyOn(PeopleCount, 'findOne').mockReturnValue({ sort } as any);

        await expect(getLatestsPeopleCountSignal('missing', 'room')).rejects.toThrow('Invalid building or roomId');
    });

    it('returns latest temperature signal', async () => {
        const expected = { temperature: 22.4, timestamp: 2000 };
        const exec = jest.fn<() => Promise<any>>().mockResolvedValue(expected);
        const sort = jest.fn().mockReturnValue({ exec });
        const findOne = jest.spyOn(Temperature, 'findOne').mockReturnValue({ sort } as any);

        const latest = await getLatestsTemperatureSignal('t1', 'r1');

        expect(findOne).toHaveBeenCalledWith({ building: 't1', roomId: 'r1' });
        expect(sort).toHaveBeenCalledWith({ timestamp: -1 });
        expect(latest).toEqual(expected);
    });

    it('returns latest air quality signal', async () => {
        const expected = { aqi: 45, timestamp: 2000 };
        const exec = jest.fn<() => Promise<any>>().mockResolvedValue(expected);
        const sort = jest.fn().mockReturnValue({ exec });
        const findOne = jest.spyOn(AirQuality, 'findOne').mockReturnValue({ sort } as any);

        const latest = await getLatestsAirQualitySignal('t1', 'r1');

        expect(findOne).toHaveBeenCalledWith({ building: 't1', roomId: 'r1' });
        expect(sort).toHaveBeenCalledWith({ timestamp: -1 });
        expect(latest).toEqual(expected);
    });

    it('throws when latest temperature signal does not exist', async () => {
        const exec = jest.fn<() => Promise<any>>().mockResolvedValue(null);
        const sort = jest.fn().mockReturnValue({ exec });
        jest.spyOn(Temperature, 'findOne').mockReturnValue({ sort } as any);

        await expect(getLatestsTemperatureSignal('missing', 'room')).rejects.toThrow('Invalid building or roomId');
    });

    it('returns latest air quality signal does not exist', async () => {
        const exec = jest.fn<() => Promise<any>>().mockResolvedValue(null);
        const sort = jest.fn().mockReturnValue({ exec });
        jest.spyOn(AirQuality, 'findOne').mockReturnValue({ sort } as any);

        await expect(getLatestsAirQualitySignal('missing', 'room')).rejects.toThrow('Invalid building or roomId');
    });

    it('returns latest people count for each room in a building via aggregate', async () => {
        const aggregateResult = [
            { roomId: 'A', value: 4, timestamp: 2000, building: 't2' },
            { roomId: 'B', value: 9, timestamp: 1500, building: 't2' }
        ];
        const aggregate = jest.spyOn(PeopleCount, 'aggregate').mockResolvedValue(aggregateResult as any);

        const result = await getAllLatestsPeopleCountSignal('t2');

        expect(aggregate).toHaveBeenCalled();
        expect(result).toEqual(aggregateResult);
    });

    it('returns latest temperature for each room in a building via aggregate', async () => {
        const aggregateResult = [
            { roomId: 'A', value: 19.1, timestamp: 2000, building: 't3' },
            { roomId: 'B', value: 21.7, timestamp: 1500, building: 't3' }
        ];
        const aggregate = jest.spyOn(Temperature, 'aggregate').mockResolvedValue(aggregateResult as any);

        const result = await getAllLatestsTemperatureSignal('t3');

        expect(aggregate).toHaveBeenCalled();
        expect(result).toEqual(aggregateResult);
    });

    it('returns latest air quality for each room in a building via aggregate', async () => {
        const aggregateResult = [
            { roomId: 'A', aqi: 31, timestamp: 2000, building: 't4' },
            { roomId: 'B', aqi: 44, timestamp: 1500, building: 't4' }
        ];
        const aggregate = jest.spyOn(AirQuality, 'aggregate').mockResolvedValue(aggregateResult as any);

        const result = await getAllLatestsAirQualitySignal('t4');

        expect(aggregate).toHaveBeenCalled();
        expect(result).toEqual(aggregateResult);
    });
});

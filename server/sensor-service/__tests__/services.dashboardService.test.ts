import { PeopleCount } from '../src/models/peopleCountSignal.js';
import { Temperature } from '../src/models/temperatureSignal.js';
import { AirQuality } from '../src/models/airQualitySignal.js';
import { getPeopleCountData, getTemperatureData, getAirQualityData } from '../src/services/dashboardService.js';
import { jest } from '@jest/globals';

describe('dashboardService', () => {
    it('uses hourly aggregation for 1D people count with room filter', async () => {
        const aggregateResult = [{ timestamp: new Date(), avg: 10, sum: 20, max: 12, min: 8 }];
        const aggregate = jest.spyOn(PeopleCount, 'aggregate').mockResolvedValue(aggregateResult as any);

        const result = await getPeopleCountData('building-dash-1', '1D', 'room-1');

        expect(result).toEqual(aggregateResult);
        const pipeline = aggregate.mock.calls[0]?.[0] as any[];
        expect(pipeline[0].$match.building).toBe('building-dash-1');
        expect(pipeline[0].$match.roomId).toBe('room-1');
        expect(pipeline[1].$group._id.$dateTrunc.unit).toBe('hour');
    });

    it('uses daily aggregation for 1W temperature over entire building', async () => {
        const aggregateResult = [{ timestamp: new Date(), avg: 20, sum: 40, max: 22, min: 18 }];
        const aggregate = jest.spyOn(Temperature, 'aggregate').mockResolvedValue(aggregateResult as any);

        const result = await getTemperatureData('building-dash-2', '1W', undefined);

        expect(result).toEqual(aggregateResult);
        const pipeline = aggregate.mock.calls[0]?.[0] as any[];
        expect(pipeline[0].$match.building).toBe('building-dash-2');
        expect(pipeline[0].$match.roomId).toBeUndefined();
        expect(pipeline[1].$group._id.$dateTrunc.unit).toBe('day');
    });

    it('uses daily aggregation for 1W air quality over entire building', async () => {
        const aggregateResult = [{ timestamp: new Date(), avg: 42, sum: 84, max: 45, min: 39 }];
        const aggregate = jest.spyOn(AirQuality, 'aggregate').mockResolvedValue(aggregateResult as any);

        const result = await getAirQualityData('building-dash-4', '1W', undefined);

        expect(result).toEqual(aggregateResult);
        const pipeline = aggregate.mock.calls[0]?.[0] as any[];
        expect(pipeline[0].$match.building).toBe('building-dash-4');
        expect(pipeline[0].$match.roomId).toBeUndefined();
        expect(pipeline[1].$group._id.$dateTrunc.unit).toBe('day');
    });

    it('falls back to 1D when range is invalid', async () => {
        const aggregateResult = [{ timestamp: new Date(), avg: 8, sum: 8, max: 8, min: 8 }];
        const aggregate = jest.spyOn(PeopleCount, 'aggregate').mockResolvedValue(aggregateResult as any);

        const result = await getPeopleCountData('building-dash-3', 'not-a-range', 'room-1');

        expect(result).toEqual(aggregateResult);
        const pipeline = aggregate.mock.calls[0]?.[0] as any[];
        expect(pipeline[1].$group._id.$dateTrunc.unit).toBe('hour');
    });
});

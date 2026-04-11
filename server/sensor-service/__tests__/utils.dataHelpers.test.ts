import { getDateRange, getTimeRange } from '../src/utils/dataHelpers.js';

describe('dataHelpers', () => {
    it('returns provided valid time range', () => {
        expect(getTimeRange('1D')).toBe('1D');
        expect(getTimeRange('1W')).toBe('1W');
        expect(getTimeRange('1M')).toBe('1M');
        expect(getTimeRange('custom')).toBe('custom');
    });

    it('falls back to 1D for invalid or empty range', () => {
        expect(getTimeRange(undefined)).toBe('1D');
        expect(getTimeRange(null)).toBe('1D');
        expect(getTimeRange('invalid')).toBe('1D');
    });

    it('builds range for 1D/1W/1M from custom end date', () => {
        const end = new Date('2026-04-11T12:00:00.000Z');
        const now = Date.now();

        const oneDay = getDateRange('1D', undefined, end);
        const oneWeek = getDateRange('1W', undefined, end);
        const oneMonth = getDateRange('1M', undefined, end);

        expect(oneDay.end).toBe(end.getTime());
        expect(oneWeek.end).toBe(end.getTime());
        expect(oneMonth.end).toBe(end.getTime());

        expect(oneDay.start).toBeLessThan(now);
        expect(oneWeek.start).toBeLessThan(now);
        expect(oneMonth.start).toBeLessThan(now);
        expect(oneMonth.start).toBeLessThanOrEqual(oneWeek.start);
        expect(oneWeek.start).toBeLessThanOrEqual(oneDay.start);
    });

    it('uses provided custom start and end for custom range', () => {
        const start = new Date('2026-04-10T00:00:00.000Z');
        const end = new Date('2026-04-11T00:00:00.000Z');

        const range = getDateRange('custom', start, end);

        expect(range.start).toBe(start.getTime());
        expect(range.end).toBe(end.getTime());
    });

    it('throws if custom range does not include start date', () => {
        expect(() => getDateRange('custom')).toThrow('Custom start date required');
    });
});

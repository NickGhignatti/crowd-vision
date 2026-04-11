export type TimeRange = '1D' | '1W' | '1M' | 'custom';

export const getTimeRange = (input: string | null | undefined): TimeRange => {
    const validRanges: TimeRange[] = ['1D', '1W', '1M', 'custom'];

    // Check if the input exists and is one of the valid options
    if (input && validRanges.includes(input as TimeRange)) {
        return input as TimeRange;
    }

    // Default fallback
    return '1D';
};

export const getDateRange = (range: TimeRange, customStart?: Date, customEnd: Date = new Date()) => {
    const end = customEnd; // Defaults to NOW
    let start = new Date();

    switch (range) {
        case '1D':
            start.setHours(end.getHours() - 24);
            break;
        case '1W':
            start.setDate(end.getDate() - 7);
            break;
        case '1M':
            start.setDate(end.getDate() - 30);
            break;
        case 'custom':
            if (!customStart) throw new Error('Custom start date required');
            start = customStart;
            break;
        default:
            // Default fallback (e.g., last 24h)
            start.setHours(end.getHours() - 24);
    }

    return { start: start.getTime(), end: end.getTime() };
};
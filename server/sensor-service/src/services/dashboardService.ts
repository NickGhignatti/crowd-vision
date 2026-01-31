import { PeopleCount } from '../models/peopleCountSignal.js';
import { Temperature } from '../models/temperatureSignal.js';
import { getDateRange, getTimeRange, type TimeRange } from '../utils/dataHelpers.js';
import { Model } from 'mongoose';

export const getPeopleCountData = async (twin: string, roomId: string, range: string) => {
    return await getAggregatedData(PeopleCount, twin, roomId, getTimeRange(range), 'peopleCount');
};

export const getTemperatureData = async (twin: string, roomId: string, range: string) => {
    return await getAggregatedData(Temperature, twin, roomId, getTimeRange(range), 'temperature');
};

const getGranularity = (range: TimeRange) => {
    return range === '24h' ? 'hour' : 'day'; 
};

/**
 * Generic function to aggregate time-series data
 */
const getAggregatedData = async (
    model: Model<any>,
    twin: string,
    roomId: string,
    range: TimeRange,
    valueField: string = 'value'
) => {
    const { start, end } = getDateRange(range);
    const granularity = getGranularity(range);

    const data = await model.aggregate([
        {
            // 1. Filter: Get only the relevant documents
            $match: {
                twin,
                roomId,
                timestamp: { $gte: start, $lte: end }
            }
        },
        {
            // 2. Group: Bucket them by time (Hour or Day)
            $group: {
                _id: { 
                    $dateTrunc: { date: "$timestamp", unit: granularity } 
                },
                // Calculate Average
                avgValue: { $avg: `$${valueField}` },
                // Calculate Max (useful for PeopleCount to see peak occupancy)
                maxValue: { $max: `$${valueField}` },
                // Calculate Min (useful for Temperature)
                minValue: { $min: `$${valueField}` }
            }
        },
        {
            // 3. Project: Clean up the output format
            $project: {
                _id: 0,
                timestamp: "$_id",
                avg: { $round: ["$avgValue", 1] }, // Round to 1 decimal
                max: "$maxValue",
                min: "$minValue"
            }
        },
        {
            // 4. Sort: Ensure the chart flows left-to-right (Oldest -> Newest)
            $sort: { timestamp: 1 }
        }
    ]);

    return data;
};
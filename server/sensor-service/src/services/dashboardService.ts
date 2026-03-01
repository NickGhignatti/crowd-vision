import { PeopleCount } from '../models/peopleCountSignal.js';
import { Temperature } from '../models/temperatureSignal.js';
import { getDateRange, getTimeRange, type TimeRange } from '../utils/dataHelpers.js';
import { Model } from 'mongoose';

export const getPeopleCountData = async (twin: string, range: string, roomId: string | undefined) => {
    return await getAggregatedData(PeopleCount, twin, roomId, getTimeRange(range), 'peopleCount');
};

export const getTemperatureData = async (twin: string, range: string, roomId: string | undefined) => {
    return await getAggregatedData(Temperature, twin, roomId, getTimeRange(range), 'temperature');
};

const getGranularity = (range: TimeRange) => {
    return range === '1D' ? 'hour' : 'day'; 
};

/**
 * Generic function to aggregate time-series data
 */
const getAggregatedData = async (
    model: Model<any>,
    twin: string,
    roomId: string | undefined,
    range: TimeRange,
    valueField: string = 'value'
) => {
    const { start, end } = getDateRange(range);
    const granularity = getGranularity(range);

    const data = await model.aggregate([
        // 1. FILTER
        {
            $match: {
                twin,
                ...(roomId && { roomId }),
                timestamp: { $gte: start, $lte: end }
            }
        },

        // 2. SINGLE GROUP BY TIME
        {
            $group: {
                _id: { 
                    $dateTrunc: { 
                        date: { $toDate: "$timestamp" }, 
                        unit: granularity 
                    } 
                },
                avgValue: { $avg: `$${valueField}` },
                maxValue: { $max: `$${valueField}` },
                minValue: { $min: `$${valueField}` },
                sumValue: { $sum: `$${valueField}` }
            }
        },

        // 3. FORMAT OUTPUT
        {
            $project: {
                _id: 0,
                timestamp: "$_id",
                avg: { $round: ["$avgValue", 1] },
                sum: { $round: ["$sumValue", 1] },
                max: "$maxValue",
                min: "$minValue"
            }
        },
        { $sort: { timestamp: 1 } }
    ]);
    return data;
};
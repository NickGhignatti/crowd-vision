import { PeopleCount } from '../models/peopleCountSignal.js';
import { Temperature } from '../models/temperatureSignal.js';

export const postPeopleCountSignal = async (twin: string, roomId: string, timestamp: number, peopleCount: number) => {

    await PeopleCount.create({
        twin,
        roomId,
        timestamp,
        peopleCount
    });
};

export const postTemperatureSignal = async (twin: string, roomId: string, timestamp: number, temperature: number) => {

    await Temperature.create({
        twin,
        roomId,
        timestamp,
        temperature
    });
};

export const getLatestsPeopleCountSignal = async (twin: string, roomId: string) => {
    const peopleCount = await PeopleCount.findOne({ twin, roomId })
        .sort({ timestamp: -1 })
        .exec();

    if (!peopleCount) {
        throw new Error('Invalid twin or roomId');
    }

    return peopleCount;
};

export const getLatestsTemperatureSignal = async (twin: string, roomId: string) => {
    const temperature = await Temperature.findOne({ twin, roomId })
        .sort({ timestamp: -1 })
        .exec();

    if (!temperature) {
        throw new Error('Invalid twin or roomId');
    }

    return temperature;
};

export const getAllLatestsPeopleCountSignal = async (twin: string) => {
    const peopleCounts = await PeopleCount.aggregate([
        { 
            $match: { twin: twin } 
        }, { 
            $sort: { timestamp: -1 } 
        }, { 
            $group: {
                _id: "$roomId",
                value: { $first: "$peopleCount" },
                timestamp: { $first: "$timestamp" },
                twin: { $first: "$twin" }
            } 
        }, { 
            $project: {
                _id: 0,
                roomId: "$_id",
                value: 1,
                timestamp: 1,
                twin: 1
            } 
        }
    ]);

    if (!peopleCounts) {
        throw new Error('Invalid twin or roomId');
    }

    return peopleCounts;
};

export const getAllLatestsTemperatureSignal = async (twin: string) => {
    const temperatures = await Temperature.aggregate([
        { 
            $match: { twin: twin } 
        }, { 
            $sort: { timestamp: -1 } 
        }, { 
            $group: {
                _id: "$roomId",
                value: { $first: "$temperature" },
                timestamp: { $first: "$timestamp" },
                twin: { $first: "$twin" }
            } 
        }, { 
            $project: {
                _id: 0,
                roomId: "$_id",
                value: 1,
                timestamp: 1,
                twin: 1
            } 
        }
    ]);

    if (!temperatures) {
        throw new Error('Invalid twin or roomId');
    }

    return temperatures;
};
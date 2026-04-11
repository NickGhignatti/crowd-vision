import { PeopleCount } from '../models/peopleCountSignal.js';
import { Temperature } from '../models/temperatureSignal.js';

export const postPeopleCountSignal = async (building: string, roomId: string, timestamp: number, peopleCount: number) => {

    await PeopleCount.create({
        building,
        roomId,
        timestamp,
        peopleCount
    });
};

export const postTemperatureSignal = async (building: string, roomId: string, timestamp: number, temperature: number) => {

    await Temperature.create({
        building,
        roomId,
        timestamp,
        temperature
    });
};

export const getLatestsPeopleCountSignal = async (building: string, roomId: string) => {
    const peopleCount = await PeopleCount.findOne({ building, roomId })
        .sort({ timestamp: -1 })
        .exec();

    if (!peopleCount) {
        throw new Error('Invalid building or roomId');
    }

    return peopleCount;
};

export const getLatestsTemperatureSignal = async (building: string, roomId: string) => {
    const temperature = await Temperature.findOne({ building, roomId })
        .sort({ timestamp: -1 })
        .exec();

    if (!temperature) {
        throw new Error('Invalid building or roomId');
    }

    return temperature;
};

export const getAllLatestsPeopleCountSignal = async (building: string) => {
    const peopleCounts = await PeopleCount.aggregate([
        { 
            $match: { building: building } 
        }, { 
            $sort: { timestamp: -1 } 
        }, { 
            $group: {
                _id: "$roomId",
                value: { $first: "$peopleCount" },
                timestamp: { $first: "$timestamp" },
                building: { $first: "$building" }
            } 
        }, { 
            $project: {
                _id: 0,
                roomId: "$_id",
                value: 1,
                timestamp: 1,
                building: 1
            } 
        }
    ]);

    if (!peopleCounts) {
        throw new Error('Invalid building or roomId');
    }

    return peopleCounts;
};

export const getAllLatestsTemperatureSignal = async (building: string) => {
    const temperatures = await Temperature.aggregate([
        { 
            $match: { building: building } 
        }, { 
            $sort: { timestamp: -1 } 
        }, { 
            $group: {
                _id: "$roomId",
                value: { $first: "$temperature" },
                timestamp: { $first: "$timestamp" },
                building: { $first: "$building" }
            } 
        }, { 
            $project: {
                _id: 0,
                roomId: "$_id",
                value: 1,
                timestamp: 1,
                building: 1
            } 
        }
    ]);

    if (!temperatures) {
        throw new Error('Invalid building or roomId');
    }

    return temperatures;
};
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
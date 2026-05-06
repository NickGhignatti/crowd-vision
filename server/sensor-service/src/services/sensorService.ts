import { PeopleCount } from '../models/peopleCountSignal.js';
import { Temperature } from '../models/temperatureSignal.js';
import { AirQuality } from '../models/airQualitySignal.js';

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

export const postAirQualitySignal = async (
    building: string,
    roomId: string,
    timestamp: number,
    scenario: string | undefined,
    pm25: number,
    pm10: number,
    co2: number,
    voc: number,
    temperature: number,
    humidity: number,
    aqi: number,
    indoor_aqi: number | undefined
) => {
    const payload = {
        building,
        roomId,
        timestamp,
        pm25,
        pm10,
        co2,
        voc,
        temperature,
        humidity,
        aqi,
        indoor_aqi: indoor_aqi ?? 0
    };

    await AirQuality.create(
        scenario === undefined
            ? payload
            : { ...payload, scenario }
    );
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

export const getLatestsAirQualitySignal = async (building: string, roomId: string) => {
    const airQuality = await AirQuality.findOne({ building, roomId })
        .sort({ timestamp: -1 })
        .exec();

    if (!airQuality) {
        throw new Error('Invalid building or roomId');
    }

    return airQuality;
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

export const getAllLatestsAirQualitySignal = async (building: string) => {
    const airQuality = await AirQuality.aggregate([
        {
            $match: { building: building }
        }, {
            $sort: { timestamp: -1 }
        }, {
            $group: {
                _id: "$roomId",
                pm25: { $first: "$pm25" },
                pm10: { $first: "$pm10" },
                co2: { $first: "$co2" },
                voc: { $first: "$voc" },
                temperature: { $first: "$temperature" },
                humidity: { $first: "$humidity" },
                aqi: { $first: "$aqi" },
                indoor_aqi: { $first: "$indoor_aqi" },
                scenario: { $first: "$scenario" },
                timestamp: { $first: "$timestamp" },
                building: { $first: "$building" }
            }
        }, {
            $project: {
                _id: 0,
                roomId: "$_id",
                pm25: 1,
                pm10: 1,
                co2: 1,
                voc: 1,
                temperature: 1,
                humidity: 1,
                aqi: 1,
                indoor_aqi: { $ifNull: ["$indoor_aqi", 0] },
                scenario: 1,
                timestamp: 1,
                building: 1
            }
        }
    ]);

    if (!airQuality) {
        throw new Error('Invalid building or roomId');
    }

    return airQuality;
};

import type { Request, Response } from 'express';
import { 
    postPeopleCountSignal,
    postTemperatureSignal,
    getLatestsPeopleCountSignal,
    getLatestsTemperatureSignal
} from "../services/sensorService.js";
import { getTemperatureData, getPeopleCountData } from '../services/dashboardService.js';
import type { PeopleCountParams, DashboardPeopleCountParams } from '../models/peopleCountSignal.js';
import type { TemperatureParams, DashboardTemperatureParams } from '../models/temperatureSignal.js';

export const postPeopleCount = async (req: Request, res: Response) => {
    try {
        const { twin, roomId, timestamp, peopleCount } = req.body;
        await postPeopleCountSignal(twin, roomId, timestamp, peopleCount);
        res.status(201).json({ message: 'People count signal created' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const postTemperature = async (req: Request, res: Response) => {
    try {
        const { twin, roomId, timestamp, temperature } = req.body;
        await postTemperatureSignal(twin, roomId, timestamp, temperature);
        res.status(201).json({ message: 'Temperature signal created' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getPeopleCount = async (req: Request<PeopleCountParams>, res: Response) => {
    try {
        const { twin, roomId } = req.params;
        const peopleCount = await getLatestsPeopleCountSignal(twin, roomId);
        res.status(200).json({ peopleCount });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getTemperature = async (req: Request<TemperatureParams>, res: Response) => {
    try {
        const { twin, roomId } = req.params;
        const temperature = await getLatestsTemperatureSignal(twin, roomId);
        res.status(200).json({ temperature });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getTemperatureDashboard = async (req: Request<DashboardTemperatureParams>, res: Response) => {
    try {
        const { twin, roomId, timeRange } = req.params;
        const temperature = await getTemperatureData(twin, roomId, timeRange);
        res.status(200).json({ temperature });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getPeopleCountDashboard = async (req: Request<DashboardPeopleCountParams>, res: Response) => {
    try {
        const { twin, roomId, timeRange } = req.params;
        const peopleCount = await getPeopleCountData(twin, roomId, timeRange);
        res.status(200).json({ peopleCount });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

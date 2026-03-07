import type { Request, Response } from 'express';
import { 
    postPeopleCountSignal,
    postTemperatureSignal,
    getLatestsPeopleCountSignal,
    getLatestsTemperatureSignal,
    getAllLatestsPeopleCountSignal,
    getAllLatestsTemperatureSignal
} from "../services/sensorService.js";
import { getTemperatureData, getPeopleCountData } from '../services/dashboardService.js';
import type { 
    PeopleCountParams, 
    DashboardPeopleCountParams,
    DashboardTwinPeopleCountParams
} from '../models/peopleCountSignal.js';
import type { 
    TemperatureParams, 
    DashboardTemperatureParams,
    DashboardTwinTemperatureParams 
} from '../models/temperatureSignal.js';

export const postPeopleCount = async (req: Request, res: Response) => {
    try {
        const { twinId, roomId, timestamp, peopleCount } = req.body;
        await postPeopleCountSignal(twinId, roomId, timestamp, peopleCount);
        res.status(201).json({ message: 'People count signal created' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const postTemperature = async (req: Request, res: Response) => {
    try {
        const { twinId, roomId, timestamp, temperature } = req.body;
        await postTemperatureSignal(twinId, roomId, timestamp, temperature);
        res.status(201).json({ message: 'Temperature signal created' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSinglePeopleCount = async (req: Request<PeopleCountParams>, res: Response) => {
    try {
        const { twin, roomId } = req.query;
        const peopleCount = await getLatestsPeopleCountSignal(twin as string, roomId as string);
        res.status(200).json({ peopleCount });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getSingleTemperature = async (req: Request<TemperatureParams>, res: Response) => {
    try {
        const { twin, roomId } = req.query;
        const temperature = await getLatestsTemperatureSignal(twin as string, roomId as string);
        res.status(200).json({ temperature });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getAllPeopleCount = async (req: Request<PeopleCountParams>, res: Response) => {
    try {
        const { twin } = req.query;
        const peopleCount = await getAllLatestsPeopleCountSignal(twin as string);
        res.status(200).json({ peopleCount });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getAllTemperature = async (req: Request<TemperatureParams>, res: Response) => {
    try {
        const { twin } = req.query;
        const temperature = await getAllLatestsTemperatureSignal(twin as string);
        res.status(200).json({ temperature });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getTemperatureDashboard = async (req: Request<DashboardTemperatureParams>, res: Response) => {
    try {
        const { twin, roomId, timeRange } = req.query;
        const temperature = await getTemperatureData(twin as string, timeRange as string, roomId as string);
        res.status(200).json({ temperature });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getPeopleCountDashboard = async (req: Request<DashboardPeopleCountParams>, res: Response) => {
    try {
        const { twin, roomId, timeRange } = req.query;
        const peopleCount = await getPeopleCountData(twin as string, timeRange as string, roomId as string);
        res.status(200).json({ peopleCount });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getEntireTwinTemperatureDashboard = async (req: Request<DashboardTwinTemperatureParams>, res: Response) => {
    try {
        const { twin, timeRange } = req.query;
        const temperature = await getTemperatureData(twin as string, timeRange as string, undefined);
        res.status(200).json({ temperature });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getEntireTwinPeopleCountDashboard = async (req: Request<DashboardTwinPeopleCountParams>, res: Response) => {
    try {
        const { twin, timeRange } = req.query;
        const peopleCount = await getPeopleCountData(twin as string, timeRange as string, undefined);
        res.status(200).json({ peopleCount });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

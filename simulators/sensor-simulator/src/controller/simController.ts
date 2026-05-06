import type { Request, Response } from 'express';
import type { Simulator } from '../services/simulatorService.js';

export const start = async (simulator: Simulator, req: Request, res: Response) => {
    try {
        simulator.start();
        res.status(200).json({ message: 'Simulator started' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const registerBuilding = async (simulator: Simulator, req: Request, res: Response) => {
    try {
        simulator.registerBuilding({
            buildingId: req.body.buildingId,
            roomIds: req.body.roomIds,
            targetUrl: req.body.targetUrl,
        });
        simulator.start();
        res.status(201).json({ message: `Building registered and started for ${req.body.buildingId}` });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const isRunning = async (simulator: Simulator, req: Request, res: Response) => {
    try {
        if (!req.query.buildingId) {
            return res.status(200).json({ isRunning: simulator.getIsRunningAny() });
        }
        const running = simulator.getIsRunning(req.query.buildingId as string);
        res.status(200).json({ isRunning: running });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

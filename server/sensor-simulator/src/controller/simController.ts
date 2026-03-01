import type { Request, Response } from 'express';
import type { Simulator } from '../services/simulatorService.js';

export const start = async (simulator: Simulator, req: Request, res: Response) => {
    try {
        simulator.startOrAdd({ twinId: req.body.twinId, roomIds: req.body.roomIds });
        res.status(200).json({ message: `Simulator started for ${req.body.twinId}` });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const stop = async (simulator: Simulator, req: Request, res: Response) => {
    try {
        simulator.stop(req.body.twinId);
        res.status(200).json({ message: 'Simulator stopped' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const isRunning = async (simulator: Simulator, req: Request, res: Response) => {
    try {
        if (!req.query.twinId) {
            return res.status(200).json({ isRunning: false });
        }
        const running = simulator.getIsRunning(req.query.twinId as string);
        res.status(200).json({ isRunning: running });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

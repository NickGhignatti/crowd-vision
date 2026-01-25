import type { Request, Response } from 'express';
import type { Simulator } from '../services/simulatorService.js';

export const start = async (simulator: Simulator, req: Request, res: Response) => {
    try {
        simulator.startOrAdd({ twinId: req.body.room, roomIds: [req.body.room] });
        res.status(200).json({ message: `Simulator started for ${req.body.room}` });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const stop = async (simulator: Simulator, req: Request, res: Response) => {
    try {
        simulator.stop();
        res.status(200).json({ message: 'Simulator stopped' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

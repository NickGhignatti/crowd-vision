import type { Request, Response } from "express";
import type { SensorKernel } from "../kernel/sensorKernel.js";
import { Sensors } from "../models/sensor.ts";

export function createReadHandlers(kernel: SensorKernel) {
  const resolveModule = (sensorType: string, res: Response) => {
    const module = kernel.resolve(sensorType);
    if (!module) {
      res.status(404).json({ error: `Unknown sensor type: '${sensorType}'` });
      return null;
    }
    return module;
  };

  return {
    getLatestSingle: async (req: Request, res: Response): Promise<void> => {
      try {
        const module = resolveModule(req.params.sensorType as string, res);
        if (!module) return;

        const { building, roomId } = req.query as {
          building: string;
          roomId: string;
        };
        const data = await module.getLatest(building, roomId);
        res.status(200).json({ data });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },

    getAllLatestBuilding: async (
      req: Request,
      res: Response,
    ): Promise<void> => {
      try {
        const module = resolveModule(req.params.sensorType as string, res);
        if (!module) return;

        const { building } = req.query as { building: string };
        const data = await module.getAllLatest(building);
        res.status(200).json({ data });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },

    getDashboard: async (req: Request, res: Response): Promise<void> => {
      try {
        const module = resolveModule(req.params.sensorType as string, res);
        if (!module) return;

        const { building, timeRange, roomId, aggMode } = req.query as {
          building: string;
          timeRange: string;
          roomId?: string;
          aggMode?: string;
        };
        const data = await module.getDashboardData(
          building,
          timeRange,
          roomId,
          aggMode,
        );
        res.status(200).json({ data });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },

    getRoomSensors: async (req: Request, res: Response): Promise<void> => {
      try {
        const { buildingId, roomId } = req.params as {
          buildingId: string;
          roomId: string;
        };

        const sensors = await Sensors.find({ buildingId, roomId })
          .lean()
          .exec();

        res.status(200).json({ data: sensors });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },

    getBuildingSensors: async (req: Request, res: Response): Promise<void> => {
      try {
        const { buildingId } = req.params as {
          buildingId: string;
        };

        const sensors = await Sensors.find({ buildingId }).lean().exec();

        res.status(200).json({ data: sensors });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  };
}

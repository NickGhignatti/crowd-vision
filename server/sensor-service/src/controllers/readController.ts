import type { Request, Response } from "express";
import type { SensorKernel } from "../kernel/sensorKernel.js";

// Reject non-string query values so an object can't reach a Mongo filter as a
// query operator (NoSQL injection).
const asString = (value: unknown, name: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Query parameter '${name}' must be a string`);
  }
  return value;
};

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

        const data = await module.getLatest(
          asString(req.query.building, "building"),
          asString(req.query.roomId, "roomId"),
        );
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

        const data = await module.getAllLatest(
          asString(req.query.building, "building"),
        );
        res.status(200).json({ data });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },

    getDashboard: async (req: Request, res: Response): Promise<void> => {
      try {
        const module = resolveModule(req.params.sensorType as string, res);
        if (!module) return;

        const data = await module.getDashboardData(
          asString(req.query.building, "building"),
          asString(req.query.timeRange, "timeRange"),
          req.query.roomId === undefined
            ? undefined
            : asString(req.query.roomId, "roomId"),
          req.query.aggMode === undefined
            ? undefined
            : asString(req.query.aggMode, "aggMode"),
        );
        res.status(200).json({ data });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  };
}

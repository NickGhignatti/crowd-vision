import type { Request, Response } from "express";
import type { SensorKernel } from "../kernel/sensorKernel.js";

export function createThresholdHandlers(kernel: SensorKernel) {
  const resolveModule = (sensorType: string, res: Response) => {
    const module = kernel.resolve(sensorType);
    if (!module) {
      res.status(404).json({ error: `Unknown sensor type: '${sensorType}'` });
      return null;
    }
    return module;
  };

  return {
    // GET /api/thresholds/:sensorType/buildings/:buildingId
    getBuildingThreshold: async (
      req: Request,
      res: Response,
    ): Promise<void> => {
      try {
        const module = resolveModule(req.params.sensorType as string, res);
        if (!module) return;

        const data = await module.getThresholds(
          req.params.buildingId as string,
        );
        res.status(200).json({ data });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },

    // PATCH /api/thresholds/:sensorType/buildings/:buildingId
    patchBuildingThreshold: async (
      req: Request,
      res: Response,
    ): Promise<void> => {
      try {
        const module = resolveModule(req.params.sensorType as string, res);
        if (!module) return;

        const data = await module.updateBuildingThreshold(
          req.params.buildingId as string,
          req.body,
        );
        res.status(200).json({ data });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },

    // PATCH /api/thresholds/:sensorType/buildings/:buildingId/rooms/:roomId
    patchRoomThreshold: async (req: Request, res: Response): Promise<void> => {
      try {
        const module = resolveModule(req.params.sensorType as string, res);
        if (!module) return;

        const data = await module.updateRoomThreshold(
          req.params.buildingId as string,
          req.params.roomId as string,
          req.body,
        );
        res.status(200).json({ data });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  };
}

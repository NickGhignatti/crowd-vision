import type { Request, Response } from "express";
import type { SensorKernel } from "../kernel/sensorKernel.js";
import { BuildingThresholdModel } from "../models/buildingThreshold.js";

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
    // PUT /thresholds/buildings/:buildingId
    // Called by twin-service when a building is registered or updated.
    // Forwards the payload to every sensor module so each type can initialise
    // its own threshold records (modules that don't support thresholds are no-ops).
    registerBuilding: async (req: Request, res: Response): Promise<void> => {
      try {
        const buildingId = req.params.buildingId as string;
        const payload = req.body;
        await Promise.all(
          kernel.getRegisteredTypes().map((type) => {
            const module = kernel.resolve(type);
            return module?.updateBuildingThreshold(buildingId, payload);
          }),
        );
        res.status(200).json({ message: "Building registered" });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },

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

    // GET /thresholds/buildings/:buildingId
    // Returns a ThresholdClone for the digital-twin view: building-level maxTemperature
    // plus per-room overrides, mapped from the internal maxTemp field name.
    getBuildingThresholdClone: async (
      req: Request,
      res: Response,
    ): Promise<void> => {
      try {
        const buildingId = req.params.buildingId as string;
        const doc = await BuildingThresholdModel.findOne({ buildingId }).exec();

        if (!doc) {
          res.status(200).json(null);
          return;
        }

        res.status(200).json({
          buildingId: doc.buildingId,
          maxTemperature: doc.temperature?.maxTemp,
          rooms: doc.rooms.map((r) => ({
            id: r.id,
            maxTemperature: r.temperature?.maxTemp,
          })),
        });
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

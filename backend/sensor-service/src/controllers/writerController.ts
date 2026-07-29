import type { Request, Response } from "express";
import type { SensorKernel } from "../kernel/sensorKernel.js";

export function createWriteHandler(kernel: SensorKernel) {
  return async function execute(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { sensorData } = req.body;
    const type = sensorData.sensorType;
    if (typeof type !== "string" || type.trim().length === 0) {
      res.status(400).json({
        error: "Missing or invalid field: `type` must be a non-empty string.",
      });
      return;
    }

    const module = kernel.resolve(type);
    if (!module) {
      res
        .status(404)
        .json({ error: `No module registered for sensor type: '${type}'.` });
      return;
    }

    try {
      await module.create(
        sensorData.buildingId,
        sensorData.roomId,
        type,
        sensorData.sensorId
      );
    } catch (err: unknown) {
      // Mongo duplicate-key violation on the compound (building, room, sensor) index.
      if ((err as { code?: number })?.code === 11000) {
        res.status(409).json({
          error: `Sensor '${sensorData.sensorId}' is already registered in this room.`,
        });
        return;
      }
      console.error("Failed to register sensor:", err);
      res.status(500).json({ error: "Failed to register sensor." });
      return;
    }

    res.status(201).json({ created: true, type });
  };
}
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

    module.create(
      sensorData.buildingId,
      sensorData.roomId,
      type,
      sensorData.sensorId
    );

    // ── The Fast Path ────────────────────────────────────────────────────────
    res.status(202).json({ accepted: true, type });

    // ── The Slow Path ────────────────────────────────────────────────────────
    setImmediate(() => {
      module.process(sensorData).catch((err: unknown) => {
        console.error(
          `[SensorKernel] Background processing failed for type='${type}':`,
          err,
        );
      });
    });
  };
}
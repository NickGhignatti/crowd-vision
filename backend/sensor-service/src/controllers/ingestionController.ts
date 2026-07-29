import type { Request, Response } from "express";
import type { SensorKernel } from "../kernel/sensorKernel.js";

export function createIngestionHandler(kernel: SensorKernel) {
  return async function ingestionHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { type, ...sensorData } = req.body;

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

    const validation = module.validate(sensorData);
    if (!validation.isValid) {
      res.status(422).json({
        error: "Payload validation failed.",
        details: validation.errors,
      });
      return;
    }

    res.status(202).json({ accepted: true, type });

    setImmediate(() => {
      module.process(sensorData).catch((err: unknown) => {
        // %s keeps user input out of the format string; strip newlines so it
        // can't forge log lines.
        console.error(
          "[SensorKernel] Background processing failed for type='%s':",
          type.replace(/[\r\n]/g, ""),
          err,
        );
      });
    });
  };
}

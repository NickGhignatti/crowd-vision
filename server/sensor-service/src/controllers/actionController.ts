import type { Request, Response } from "express";
import type { SensorKernel } from "../kernel/sensorKernel.js";
import { ActionService } from "../services/ActionService.ts";

export function createActionHandler(kernel: SensorKernel) {
  return async function execute(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { actionData } = req.body;
    const type = actionData.sensorType;

    if (typeof type !== "string" || type.trim().length === 0) {
      res.status(400).json({
        error: "Missing or invalid field: `type` must be a non-empty string.",
      });
      return;
    }

    const actionService = new ActionService;
    const module = kernel.resolve(type);
    if (!module) {
      res
        .status(404)
        .json({ error: `No module registered for sensor type: '${type}'.` });
      return;
    }

    const validation = module.validate(actionData);
    if (!validation.isValid) {
      res.status(422).json({
        error: "Payload validation failed.",
        details: validation.errors,
      });
      return;
    }

    const sensorId = await actionService.getSensorId(actionData.roomId, actionData.buildingId);
    console.log(sensorId);

    // ── The Fast Path ────────────────────────────────────────────────────────
    res.status(202).json({ accepted: true, type });

    // ── The Slow Path ────────────────────────────────────────────────────────
    setImmediate(() => {
      module.process(actionData).catch((err: unknown) => {
        console.error(
          `[SensorKernel] Background processing failed for type='${type}':`,
          err,
        );
      });
    });
  };
}

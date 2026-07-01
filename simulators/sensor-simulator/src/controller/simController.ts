import type { Request, Response } from "express";
import type { Simulator } from "../services/simulatorService.js";

/**
 * Recursively strips CR/LF from strings so user-provided request data can't
 * forge new log entries when logged.
 */
const sanitizeForLog = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(/[\r\n]/g, "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, sanitizeForLog(val)]),
    );
  }
  return value;
};

export const start = async (
  simulator: Simulator,
  req: Request,
  res: Response,
) => {
  try {
    simulator.startOrAdd({
      buildingId: req.body.buildingId,
      roomIds: req.body.roomIds,
      targetUrl: req.body.targetUrl,
    });
    res
      .status(200)
      .json({ message: `Simulator started for ${req.body.buildingId}` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const stop = async (
  simulator: Simulator,
  req: Request,
  res: Response,
) => {
  try {
    simulator.stop(req.body.buildingId);
    res
      .status(200)
      .json({ message: `Simulator stopped for ${req.body.buildingId}` });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const isRunning = async (
  simulator: Simulator,
  req: Request,
  res: Response,
) => {
  try {
    if (!req.query.buildingId) {
      return res.status(200).json({ isRunning: simulator.getIsRunningAny() });
    }
    const running = simulator.getIsRunning(req.query.buildingId as string);
    res.status(200).json({ isRunning: running });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const isReceivingAction = async (
  req: Request,
  res: Response,
) => {
  console.log(sanitizeForLog(req.body));
  res.status(202);
};
import type { NextFunction, Request, Response } from "express";
import {
  httpRequestDuration,
  httpRequestsError,
  httpRequestsTotal,
} from "../config/registry.js";

export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.path === "/metrics/" || req.path === "/health/") return next();

  const start = Date.now();
  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: req.route?.path ?? req.path,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, (Date.now() - start) / 1000);
    if (res.statusCode >= 400) httpRequestsError.inc(labels);
  });

  next();
};

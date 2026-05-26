import type { Request, Response, NextFunction } from "express";
import {
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestsError,
} from "../config/registry.js";

export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.path === "/metrics" || req.path === "/health") {
    return next();
  }

  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path ?? req.path;
    const labels = {
      method: req.method,
      route: route,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
    if (req.statusCode || 0 >= 400) httpRequestsError.inc(labels);
  });

  next();
};

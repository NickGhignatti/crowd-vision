import type { Request, Response, NextFunction } from "express";
import { BaseError } from "../models/error.js";

export const globalErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof BaseError) {
    return res.status(err.code).json({
      type: err.type,
      message: err.message,
    });
  }

  return res.status(500).json({
    type: "Internal Server Error",
    message: "An unexpected error occurred. Please try again later.",
  });
};

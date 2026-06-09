import type { NextFunction, Request, Response } from "express";
import { Error as MongooseError } from "mongoose";
import { BaseError } from "../models/error.js";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof BaseError) {
    return res.status(err.code).json({ type: err.type, message: err.message });
  }

  if (err instanceof MongooseError.ValidationError) {
    return res.status(400).json({
      type: "Validation Error",
      message: err.message,
    });
  }

  return res.status(500).json({
    type: "Internal Server Error",
    message: "An unexpected error occurred. Please try again later.",
  });
};

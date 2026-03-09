import type { NextFunction, Request, Response } from "express";
import * as TokenService from "../services/tokenService.js";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Authentication token missing or malformed" });
    }

    const token = authHeader.split(" ")[1];

    req.user = TokenService.verifyToken(token || "");

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

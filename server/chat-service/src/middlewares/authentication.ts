import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { COOKIE_NAME, getTokenSecret } from "../config/config.js";
import { UnauthorizedError } from "../models/error.js";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      userId?: string;
    }
  }
}

export const requireAuthentication = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) throw new UnauthorizedError("Missing authentication token");

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, getTokenSecret(), { algorithms: ["HS256"] });
  } catch {
    throw new UnauthorizedError("Invalid authentication token");
  }

  if (typeof payload === "string") {
    throw new UnauthorizedError("Invalid authentication token");
  }

  // 
  const userId = payload.accountId;
  if (typeof userId !== "string" || !userId) {
    throw new UnauthorizedError("Authentication token is missing an account id");
  }

  req.account = payload;
  req.userId = userId;
  next();
};

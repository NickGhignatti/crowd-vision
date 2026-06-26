import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { COOKIE_NAME, getTokenSecret } from "../config/config.js";
import { UnauthorizedError } from "../models/error.js";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      // Raw bearer/cookie token, kept so twin can forward the caller's identity
      // on its own service-to-service calls (e.g. the sensor threshold sync).
      authToken?: string;
    }
  }
}

// Browsers send the JWT as a cookie; trusted services (the RAG agent, twin's own
// outbound calls) forward it as `Authorization: Bearer`. Accept either so one
// guard covers both callers without a separate service credential.
const extractToken = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();

  return undefined;
};

export const requireAuthentication = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);
  if (!token) throw new UnauthorizedError("Missing authentication token");

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, getTokenSecret(), { algorithms: ["HS256"] });
  } catch {
    throw new UnauthorizedError("Invalid authentication token");
  }

  if (typeof payload === "string" || !payload.accountId) {
    throw new UnauthorizedError("Authentication token is missing an account id");
  }

  req.account = payload;
  req.authToken = token;
  next();
};

import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { InternalError, UnauthorizedError } from "../models/error.js";

// Same cookie/secret the rest of the fleet uses for the auth-service JWT.
const COOKIE_NAME = process.env.JWT_COOKIE_NAME ?? "authentication_token";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
      // Raw token, forwarded to twin-service on the building→domain lookup.
      authToken?: string;
    }
  }
}

// Browsers send the JWT in a cookie; trusted services forward it as a bearer token.
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
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new InternalError("Missing JWT_SECRET configuration");

  const token = extractToken(req);
  if (!token) throw new UnauthorizedError("Missing authentication token");

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    throw new UnauthorizedError("Invalid authentication token");
  }

  if (typeof payload === "string" || !payload.accountName) {
    throw new UnauthorizedError("Authentication token is missing an account");
  }

  req.account = payload;
  req.authToken = token;
  next();
};

// The account the request acts as — never trust an account name from the body or
// URL, always the verified token (prevents reading/writing another user's data).
export const callerAccountName = (req: Request): string =>
  req.account?.accountName as string;

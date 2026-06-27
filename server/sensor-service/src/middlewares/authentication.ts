import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

// Same cookie/secret the rest of the fleet uses for the auth-service JWT.
const COOKIE_NAME = process.env.JWT_COOKIE_NAME ?? "authentication_token";

declare global {
  namespace Express {
    interface Request {
      account?: JwtPayload;
    }
  }
}

// Browsers send the JWT in a cookie; trusted services (twin-service forwarding the
// caller's identity on the threshold sync) send it as `Authorization: Bearer`.
const extractToken = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();

  return undefined;
};

// Responds directly (rather than throwing) because sensor-service has no global
// error handler — each controller shapes its own response.
export const requireAuthentication = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Missing JWT_SECRET configuration" });
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing authentication token" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload.accountId) {
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }
    req.account = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid authentication token" });
  }
};

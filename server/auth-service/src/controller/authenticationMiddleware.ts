import type { NextFunction, Request, Response } from "express";
import * as TokenService from "../services/tokenService.js";
import crypto from "crypto";
import { getAdminSecret } from "../config/config.js";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const requireAuthentication = (
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

export const requireHmacSignature = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const signature = req.headers["x-signature"];
  const secret = getAdminSecret();

  if (!secret) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (!signature) {
    return res.status(401).json({ error: "Forbidden: missing signature" });
  }

  const message = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  const signatureBuffer = Buffer.from(signature as String);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return res.status(403).json({ error: "Forbidden: Invalid signature" });
  }

  next();
};

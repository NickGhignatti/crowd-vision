import type { NextFunction, Request, Response } from "express";
import * as TokenService from "../services/tokenService.js";
import crypto from "crypto";
import { getAdminSecret } from "../config/config.js";

declare global {
  namespace Express {
    interface Request {
      account?: any;
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

    req.account = TokenService.verifyToken(token || "");

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

  if (!signature || typeof signature !== "string") {
    return res.status(401).json({ error: "Forbidden: missing signature" });
  }

  const rawBody: Buffer | undefined = (req as any).rawBody;

  if (!rawBody) {
    return res.status(400).json({ error: "Raw request body unavailable for signature verification" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  let signatureBuffer: Buffer;
  let expectedBuffer: Buffer;
  try {
    signatureBuffer = Buffer.from(signature, "hex");
    expectedBuffer = Buffer.from(expectedSignature, "hex");
  } catch {
    return res.status(403).json({ error: "Forbidden: Invalid signature" });
  }

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return res.status(403).json({ error: "Forbidden: Invalid signature" });
  }

  next();
};

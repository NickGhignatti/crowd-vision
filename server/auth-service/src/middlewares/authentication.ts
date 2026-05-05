import type { NextFunction, Request, Response } from "express";
import * as TokenService from "../services/token.js";
import crypto from "crypto";
import { COOKIE_NAME, getAdminSecret } from "../config/config.js";
import {
  ForbiddenError,
  InternalError,
  NotFoundError, ValidationError,
} from "../models/error.js";

declare global {
  namespace Express {
    interface Request {
      account?: any;
    }
  }
}

export const requireAuthentication = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    throw new NotFoundError(`Could not find token for the cookie`);
  }

  req.account = TokenService.verifyToken(token);
  next();
};

export const requireHmacSignature = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const signature = req.headers["x-signature"];
  const secret = getAdminSecret();

  if (!secret) {
    throw new InternalError("Server configuration error, missing administration secrets");
  }

  if (!signature || typeof signature !== "string") {
    throw new ForbiddenError(`Invalid signature`);
  }

  const rawBody: Buffer | undefined = (req as any).rawBody;

  if (!rawBody) {
    throw new ValidationError(
      "Raw request body unavailable for signature verification",
    );
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
    throw new ForbiddenError("Invalid signature");
  }

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new ForbiddenError("Invalid signature");
  }

  next();
};

import jwt from "jsonwebtoken";

import type {
  DeviceTokenPayload,
  StandardTokenPayload,
} from "../models/token.js";
import { getTokenSecret } from "../config/config.js";

export const generateStandardToken = (payload: StandardTokenPayload) => {
  const secret = getTokenSecret();

  if (!secret) {
    throw new Error("secret configuration error");
  }

  return jwt.sign(
    {
      accountId: payload.accountId,
      accountName: payload.accountName,
    },
    secret,
    { expiresIn: "3h" },
  );
};

export const generateDeviceToken = (payload: DeviceTokenPayload) => {
  const secret = getTokenSecret();

  if (!secret) {
    throw new Error("secret configuration error");
  }

  return jwt.sign(
    {
      domainName: payload.domainName,
      buildingId: payload.buildingId,
      deviceName: payload.deviceName,
      deviceType: payload.deviceType,
      isBuildingSpecific: payload.isBuildingSpecific,
    },
    secret,
    { expiresIn: "1825d" },
  );
};

export const verifyToken = (token: string) => {
  const secret = getTokenSecret();

  if (!secret) {
    throw new Error("secret configuration error");
  }

  return jwt.verify(token, secret);
};

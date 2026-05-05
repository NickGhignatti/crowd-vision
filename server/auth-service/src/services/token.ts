import jwt from "jsonwebtoken";

import type {
  DeviceTokenPayload,
  StandardTokenPayload,
} from "../models/token.js";
import { getTokenSecret } from "../config/config.js";
import { Account } from "../models/account.js";
import { InternalError, NotFoundError } from "../models/error.js";

export const generateStandardToken = async (
  payload: StandardTokenPayload,
) => {
  const secret = getTokenSecret();

  if (!secret) {
    throw new InternalError("Missing token secrets configuration");
  }

  const account = await Account.findOne({ name: payload.accountName });

  if (!account) {
    throw new NotFoundError(`Account with name "${payload.accountName}" does not exist`);
  }

  return jwt.sign(
    {
      accountId: payload.accountId,
      accountName: payload.accountName,
      accountMemberships: account.memberships,
    },
    secret,
    { expiresIn: "3h" },
  );
};

export const generateDeviceToken = (payload: DeviceTokenPayload) => {
  const secret = getTokenSecret();

  if (!secret) {
    throw new InternalError("Missing token secrets configuration");
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
    throw new InternalError("Missing token secrets configuration");
  }

  return jwt.verify(token, secret);
};

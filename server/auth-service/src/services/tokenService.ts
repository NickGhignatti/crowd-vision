import jwt from "jsonwebtoken";

import type {DeviceTokenPayload, StandardTokenPayload} from "../models/token.js";

const getTokenSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET environment variable is not set");
    }
    return secret;
}

export const generateStandardToken = (user: StandardTokenPayload)=> {
    return jwt.sign({
        userId: user.userId,
        username: user.username
    }, getTokenSecret(), { expiresIn: "3h" })
}

export const generateDeviceToken = (payload: DeviceTokenPayload) => {
    return jwt.sign({
        domainName: payload.domainName,
        buildingId: payload.buildingId,
        deviceName: payload.deviceName,
        deviceType: payload.deviceType,
        isBuildingSpecific: payload.isBuildingSpecific
    }, getTokenSecret(), { expiresIn: "1825d" })
}

export const verifyToken = (token: string) => {
    return jwt.verify(token, getTokenSecret())
}


import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { StandardTokenPayload } from "./token.js";
import { getTokenSecret } from "../config/config.js";

export const ROLE_WEIGHTS = {
  admin: 100,
  business_admin: 80,
  business_staff: 60,
  standard_customer: 10,
} as const;

export type Role = keyof typeof ROLE_WEIGHTS;

const hasRequiredRole = (userRole: Role, requiredRole: Role): boolean => {
  const currentUserRoleWeight = ROLE_WEIGHTS[userRole] || 0;
  const requiredRoleWeight = ROLE_WEIGHTS[requiredRole] || Infinity;

  return currentUserRoleWeight >= requiredRoleWeight;
};

export const requireAuthorization = (requiredLevel: Role) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      let tokenFields: StandardTokenPayload | null = null;

      // Prefer the already-verified payload set by requireAuthentication
      if (req.account) {
        tokenFields = req.account as StandardTokenPayload;
      } else {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res
            .status(401)
            .json({ error: "Authentication token missing or malformed" });
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
          throw new Error("token missing");
        }

        const secret = getTokenSecret();
        if (!secret) {
          throw new Error("server configuration error");
        }

        tokenFields = jwt.verify(token, secret) as StandardTokenPayload;
      }

      if (!tokenFields || !Array.isArray(tokenFields.accountMemberships)) {
        throw new Error("invalid token payload");
      }

      const { domainName } = req.params;

      const candidateMemberships = domainName
        ? tokenFields.accountMemberships.filter(
            (m) => m.domainName === (domainName as string),
          )
        : tokenFields.accountMemberships;

      if (candidateMemberships.length <= 0) {
        throw new Error("account does not have memberships for authorization");
      }

      const hasPermission = candidateMemberships.some((membership) => {
        return hasRequiredRole(membership.role, requiredLevel);
      });

      if (!hasPermission) {
        throw new Error("not enough permissions");
      }

      next();
    } catch (error) {
      return res
        .status(403)
        .json({ error: "Forbidden: Not enough permissions or invalid token" });
    }
  };
};

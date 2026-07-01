import type { NextFunction, Request, Response } from "express";
import type { StandardTokenPayload } from "../models/token.js";
import { Account } from "../models/account.js";
import { hasRequiredRole, type Role } from "../models/role.js";

/**
 * Guards a route on a minimum role. When the route carries a `:domainName`, the
 * check is scoped to that domain; otherwise it considers all of the caller's
 * memberships.
 *
 * Identity comes solely from `req.account`, the payload of the JWT already
 * verified by `requireAuthentication` (which every route using this guard runs
 * first). This middleware never re-parses a request-supplied token, so a caller
 * cannot influence the authorization decision through headers.
 *
 * Authorization reads the caller's CURRENT memberships from the DB rather than
 * the snapshot embedded in the JWT at login. Tokens live for hours, so a user
 * who just created or joined a domain would otherwise be wrongly rejected from
 * that domain's role-gated routes until they logged in again.
 */
export const requireAuthorization = (requiredLevel: Role) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokenFields = req.account as StandardTokenPayload | undefined;

      if (!tokenFields?.accountName) {
        throw new Error("invalid token payload");
      }

      // $eq blocks NoSQL operator injection.
      const account = await Account.findOne({
        name: { $eq: tokenFields.accountName },
      });
      const memberships = account?.memberships ?? [];

      const { domainName } = req.params;

      // Domain names are case-insensitive (RFC 4343). The client lowercases the
      // master-domain name when building subdomain URLs, so a case-sensitive
      // compare would wrongly 403 an admin of e.g. "Kubeet" hitting
      // /subdomains/kubeet. Compare case-insensitively.
      const target = (domainName as string | undefined)?.toLowerCase();
      const candidateMemberships = target
        ? memberships.filter((m) => m.domainName.toLowerCase() === target)
        : memberships;

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

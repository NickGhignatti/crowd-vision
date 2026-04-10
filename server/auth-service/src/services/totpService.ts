import { hasRequiredRole, type Role, ROLE_WEIGHTS } from "../models/role.js";
import * as OTPAuth from "otpauth";
import { Domain, type IDomainMembership } from "../models/domain.js";
import { Account } from "../models/account.js";
import { Types } from "mongoose";
import { NotFoundError } from "../models/error.js";

export const resolveRoleFromOTP = async (otp: string) => {
  const domains = await Domain.find().select("+totpSecrets");

  if (!domains || domains.length <= 0) {
    throw new NotFoundError("Domain or SSO configuration not found");
  }

  for (const domain of domains) {
    for (const [role, secret] of Object.entries(domain.totpSecrets)) {
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      if (totp.validate({ token: otp, window: 1 }) !== null) {
        return {
          domainName: domain.name,
          role: role as Role,
        } as IDomainMembership
      }
    }
  }

  throw new NotFoundError("Invalid OTP provided");
};

export const createTOTPForAuthorizedRoles = async (minimumRole: Role) => {
  const roles = Object.keys(ROLE_WEIGHTS) as Role[];

  return Object.fromEntries(
    roles
      .filter((role) => hasRequiredRole(role, minimumRole))
      .map((role) => [role, new OTPAuth.Secret().base32]),
  );
}

export const grantTOTPRoles = async (otp: string, accountId: Types.ObjectId) => {
  const grantedRole = await resolveRoleFromOTP(otp);

  if (grantedRole) {
    await Account.findByIdAndUpdate(accountId, {
      $pull: { memberships: { domainName: grantedRole.domainName } },
    });
    await Account.findByIdAndUpdate(accountId, {
      $push: { memberships: grantedRole },
    });
  }
};
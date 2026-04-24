import {
  Domain,
  type IDomain,
  type ISSOConfig,
} from "../models/domain.js";
import { Account } from "../models/account.js";
import { createTOTPForAuthorizedRoles } from "./totpService.js";
import { ConflictError, NotFoundError } from "../models/error.js";
import { getServerUrl } from "../config/config.js";

export const createDomain = async (
  domainName: string,
  subdomains: IDomain[],
  creatorAccountName: string,
  authenticationStrategy: "internal" | "oidc",
  ssoConfig?: ISSOConfig,
  isVisibleFromOutside: boolean = false,
) => {
  const domain = await Domain.findOne({ name: domainName });

  if (domain) {
    throw new ConflictError(`Domain with name "${domainName}" already exists`);
  }

  const totpSecrets = await createTOTPForAuthorizedRoles("business_staff");

  const createdDomain = await Domain.create({
    name: domainName,
    subdomains,
    authStrategy: authenticationStrategy,
    ...(authenticationStrategy === "oidc" && ssoConfig ? { ssoConfig } : {}),
    totpSecrets,
    isVisibleFromOutside,
  });

  await Account.findOneAndUpdate(
    { name: creatorAccountName },
    {
      $push: {
        memberships: { domainName: domainName, role: "business_admin" },
      },
    },
  );

  await fetch(`${getServerUrl()}/notification/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: creatorAccountName,
      domainId: domainName,
      enabled: true,
    }),
  });

  return createdDomain;
};

export const getAllDomains = async () => {
  return Domain.find().select("-ssoConfig.clientSecret");
};

export const getAllAllowedDomains = async () => {
  return Domain.find({ isVisibleFromOutside: true }).select(
    "-ssoConfig.clientSecret",
  );
};

export const getDomainByName = async (domainName: string) => {
  return Domain.findOne({ name: domainName }).select("-ssoConfig.clientSecret");
};

export const getDomainSubdomains = async (name: string) => {
  const result = await Domain.aggregate([
    { $match: { name } },
    {
      $graphLookup: {
        from: "domains",
        startWith: "$subdomains",
        connectFromField: "subdomains",
        connectToField: "_id",
        as: "allSubdomains",
      },
    },
    {
      $project: {
        _id: 0,
        names: "$allSubdomains.name", // extract just the name field from each
      },
    },
  ]);

  if (!result[0]) {
    throw new NotFoundError(`Domain with name "${name}" not found`);
  }

  return result[0].names ?? [];
};

export const attachSubdomainToDomain = async (
  domainName: string,
  subDomain: IDomain,
) => {
  const parent = await Domain.findOneAndUpdate(
    { name: domainName },
    { $addToSet: { subdomains: subDomain._id } },
  );
};

// --- Memberships ---
export const getAccountMemberships = async (accountName: string) => {
  const account = await Account.findOne({ name: accountName });

  if (!account) {
    throw new NotFoundError(`Account with name "${accountName}" not found`);
  }

  return account.memberships;
};

export const subscribeInternal = async (
  accountName: string,
  domainName: string,
) => {
  const domain = await Domain.findOne({ name: domainName });

  if (!domain) {
    throw new NotFoundError(`Domain with name "${domainName}" not found`);
  }

  if (domain.authStrategy === "oidc") {
    throw new NotFoundError(
      `Domain with name "${domainName}" does not support internal subscription`,
    );
  }

  await Account.findOneAndUpdate(
    { name: accountName },
    { $addToSet: { memberships: { domainName, role: "standard_customer" } } },
  );

  await fetch(`${getServerUrl()}/notification/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: accountName,
      domainId: domainName,
      enabled: true
    }),
  });
};

export const unsubscribe = async (accountName: string, domainName: string) => {
  await Account.findOneAndUpdate(
    { name: accountName },
    { $pull: { memberships: { domainName } } },
  );

  await fetch(`${getServerUrl()}/notification/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: accountName,
      domainId: domainName,
      enabled: false,
    }),
  });
};

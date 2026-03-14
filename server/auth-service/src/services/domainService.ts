import { Domain, type ISSOConfig } from "../models/domain.js";
import { Account } from "../models/account.js";

export const createDomain = async (
    domainName: string,
    subdomains: string[],
    creatorAccountName: string,
    authenticationStrategy: "internal" | "oidc",
    ssoConfig?: ISSOConfig,
) => {
  const domain = await Domain.findOne({ name: domainName });

  if (domain) {
    throw new Error("domain already exists");
  }

  const createdDomain = await Domain.create({
    name: domainName,
    subdomains,
    authStrategy: authenticationStrategy,
    ...(authenticationStrategy === "oidc" && ssoConfig ? { ssoConfig } : {}),
  });

  await Account.findOneAndUpdate(
    { name: creatorAccountName },
    { $push: { memberships: { domainName: domainName, role: "owner" } } },
  );

  return createdDomain;
};

export const getAllDomains = async () => {
  return Domain.find().select("-ssoConfig.clientSecret");
};

export const getDomainByName = async (domainName: string) => {
  return Domain.findOne({ name: domainName }).select("-ssoConfig.clientSecret");
};

// --- Memberships ---

export const getAccountMemberships = async (accountName: string) => {
  const account = await Account.findOne({ name: accountName });

  if (!account) {
    throw new Error("account not found");
  }

  return account.memberships;
};

export const subscribeInternal = async (
    accountName: string,
    domainName: string,
) => {
  const domain = await Domain.findOne({ name: domainName });

  if (!domain) {
    throw new Error("Domain not found");
  }

  if (domain.authStrategy === "oidc") {
    throw new Error("this domain requires SSO login");
  }

  await Account.findOneAndUpdate(
    { name: accountName },
    { $addToSet: { memberships: { domainName, role: "viewer" } } },
  );
};

export const unsubscribe = async (accountName: string, domainName: string) => {
  await Account.findOneAndUpdate(
    { name: accountName },
    { $pull: { memberships: { domainName } } },
  );
};

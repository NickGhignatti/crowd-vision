import { Domain, type IDomain, type ISSOConfig } from "../models/domain.js";
import { Account } from "../models/account.js";

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
    throw new Error("domain already exists");
  }

  const createdDomain = await Domain.create({
    name: domainName,
    subdomains,
    authStrategy: authenticationStrategy,
    ...(authenticationStrategy === "oidc" && ssoConfig ? { ssoConfig } : {}),
    isVisibleFromOutside
  });

  await Account.findOneAndUpdate(
    { name: creatorAccountName },
    { $push: { memberships: { domainName: domainName, role: "business_admin" } } },
  );

  return createdDomain;
};

export const getAllDomains = async () => {
  return Domain.find().select("-ssoConfig.clientSecret");
};

export const getAllAllowedDomains = async () => {
  return Domain.find({ isVisibleFromOutside: true }).select("-ssoConfig.clientSecret");
}

export const getDomainByName = async (domainName: string) => {
  return Domain.findOne({ name: domainName }).select("-ssoConfig.clientSecret");
};

export const getDomainSubdomains = async (name: string): Promise<string[]> => {
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

  if (!result[0]) throw new Error(`Domain "${name}" not found`);

  return result[0].names ?? [];
};

export const attachSubdomainToDomain = async (domainName: string, subDomain: IDomain) => {
  const parent = await Domain.findOneAndUpdate(
    { name: domainName },
    { $addToSet: { subdomains: subDomain._id } },
  );
}

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
    { $addToSet: { memberships: { domainName, role: "standard_customer" } } },
  );
};

export const unsubscribe = async (accountName: string, domainName: string) => {
  await Account.findOneAndUpdate(
    { name: accountName },
    { $pull: { memberships: { domainName } } },
  );
};

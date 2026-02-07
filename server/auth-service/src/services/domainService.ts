import { Domain, type ISSOConfig } from "../models/domain.js";
import { User } from "../models/user.js";

export const createDomain = async (
  name: string,
  subdomains: string[],
  creatorUsername: string,
  authStrategy: "internal" | "oidc",
  ssoConfig?: ISSOConfig,
) => {
  const existing = await Domain.findOne({ name });
  if (existing) throw new Error("Domain already exists");

  const domain = await Domain.create({
    name,
    subdomains,
    authStrategy,
    ...(authStrategy === "oidc" && ssoConfig ? { ssoConfig } : {}),
  });

  await User.findOneAndUpdate(
    { username: creatorUsername },
    { $push: { memberships: { domainName: name, role: "owner" } } },
  );

  return domain;
};

export const getAllDomains = async () => {
  // Exclude clientSecret from output
  return Domain.find().select("-ssoConfig.clientSecret");
};

export const getDomainByName = async (name: string) => {
  return Domain.findOne({ name }).select("-ssoConfig.clientSecret");
};

// --- Memberships ---

export const getUserMemberships = async (username: string) => {
  const user = await User.findOne({ username });
  if (!user) throw new Error("User not found");
  return user.memberships;
};

export const subscribeInternal = async (
  username: string,
  domainName: string,
) => {
  const domain = await Domain.findOne({ name: domainName });
  if (!domain) throw new Error("Domain not found");

  if (domain.authStrategy === "oidc") {
    throw new Error("This domain requires SSO login");
  }

  await User.findOneAndUpdate(
    { username },
    { $addToSet: { memberships: { domainName, role: "viewer" } } },
  );
};

export const unsubscribe = async (username: string, domainName: string) => {
  await User.findOneAndUpdate(
    { username },
    { $pull: { memberships: { domainName } } },
  );
};

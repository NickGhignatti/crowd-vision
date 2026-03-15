import bcrypt from "bcrypt";
import * as client from "openid-client";
import { Account } from "../models/account.js";
import { Domain } from "../models/domain.js";
import { getClientUrl, getServerUrl } from "../config/config.js";

export const registerAccount = async (
  accountName: string,
  email: string,
  password: string,
) => {
  const account = await Account.findOne({
    $or: [{ email }, { name: accountName }],
  });
  if (account) {
    throw new Error("user already exists");
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  return await Account.create({
    name: accountName,
    email,
    password: passwordHash,
    memberships: [],
  });
};

export const authenticateAccount = async (
  accountName: string,
  password: string,
) => {
  const account = await Account.findOne({ name: accountName });
  if (!account) {
    throw new Error("wrong account name");
  }

  const match = await bcrypt.compare(password, account.password);
  if (!match) {
    throw new Error("wrong password");
  }

  return account;
};

export const generateSSOLoginUrl = async (
  domainName: string,
  accountName: string,
) => {
  // Fetch domain with secret
  const domain = await Domain.findOne({ name: domainName }).select(
    "+ssoConfig.clientSecret",
  );

  if (!domain || domain.authStrategy !== "oidc" || !domain.ssoConfig) {
    throw new Error("SSO not configured for this domain");
  }

  // Discover IdP
  const serverUrl = new URL(domain.ssoConfig.issuerUrl);
  const config = await client.discovery(
    serverUrl,
    domain.ssoConfig.clientId,
    domain.ssoConfig.clientSecret,
  );

  // Generate Code Challenge
  const code_verifier = client.randomPKCECodeVerifier();
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);

  // Encode State (username + domain + verifier) to survive the redirect
  // TODO : In production, store this in Redis/Session. Currently we use base64 for statelessness.
  const statePayload = JSON.stringify({
    cv_username: accountName,
    domain: domainName,
    cv_verifier: code_verifier,
  });
  const state = Buffer.from(statePayload).toString("base64");

  // Build URL
  const redirectUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: `${getServerUrl()}/auth/sso/callback`,
    scope: "openid email profile groups",
    code_challenge,
    code_challenge_method: "S256",
    state,
  });

  return redirectUrl.href;
};

export const processSSOCallback = async (fullUrl: string) => {
  const currentUrl = new URL(fullUrl, getServerUrl());
  const stateParam = currentUrl.searchParams.get("state");
  if (!stateParam) {
    throw new Error("No state returned from provider");
  }

  // Decode State
  const { cv_username, domain, cv_verifier } = JSON.parse(
    Buffer.from(stateParam, "base64").toString(),
  );

  // Re-fetch Config
  const domainDoc = await Domain.findOne({ name: domain }).select(
    "+ssoConfig.clientSecret",
  );
  if (!domainDoc || !domainDoc.ssoConfig) {
    throw new Error("Invalid domain config");
  }

  const serverUrl = new URL(domainDoc.ssoConfig.issuerUrl);
  const config = await client.discovery(
    serverUrl,
    domainDoc.ssoConfig.clientId,
    domainDoc.ssoConfig.clientSecret,
  );

  // Exchange Code for Tokens
  const tokenSet = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: cv_verifier,
  });

  const claims = tokenSet.claims();

  // Map Roles
  const userGroups = claims ? (claims.groups as string[]) || [] : [];
  const role =
    userGroups.includes("staff") || userGroups.includes("admin")
      ? "admin"
      : "viewer";

  // Update Account Membership (Upsert)
  await Account.findOneAndUpdate(
    { username: cv_username },
    { $pull: { memberships: { domainName: domain } } }, // Remove old
  );

  await Account.findOneAndUpdate(
    { username: cv_username },
    {
      $push: {
        memberships: {
          domainName: domain,
          role: role,
          externalId: claims ? claims.sub : null,
        },
      },
    },
  );

  return `${getClientUrl()}/domains?refresh=true`;
};

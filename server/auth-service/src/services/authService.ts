import bcrypt from "bcrypt";
import * as client from "openid-client";
import { User } from "../models/user.js";
import { Domain } from "../models/domain.js";

// Helper to get server URL
const getServerUrl = () =>
  process.env.VITE_SERVER_URL || "http://localhost:3000";
const getClientUrl = () => process.env.CLIENT_URL || "http://localhost:5173";

// --- Local Auth ---

export const registerUser = async (
  username: string,
  email: string,
  password: string,
) => {
  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) throw new Error("User already exists");

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  return await User.create({
    username,
    email,
    password: passwordHash,
    memberships: [],
  });
};

export const authenticateUser = async (username: string, password: string) => {
  const user = await User.findOne({ username });
  if (!user) throw new Error("Invalid credentials");

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error("Invalid credentials");

  return user;
};

// --- SSO Logic ---

export const generateSSOLoginUrl = async (
  domainName: string,
  username: string,
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
  // TODO : In production, store this in Redis/Session. Here we use base64 for statelessness.
  const statePayload = JSON.stringify({
    cv_username: username,
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
  if (!stateParam) throw new Error("No state returned from provider");

  // Decode State
  const { cv_username, domain, cv_verifier } = JSON.parse(
    Buffer.from(stateParam, "base64").toString(),
  );

  // Re-fetch Config
  const domainDoc = await Domain.findOne({ name: domain }).select(
    "+ssoConfig.clientSecret",
  );
  if (!domainDoc || !domainDoc.ssoConfig)
    throw new Error("Invalid domain config");

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

  // Update User Membership (Upsert)
  await User.findOneAndUpdate(
    { username: cv_username },
    { $pull: { memberships: { domainName: domain } } }, // Remove old
  );

  await User.findOneAndUpdate(
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

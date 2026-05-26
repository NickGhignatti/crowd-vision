import { jest } from "@jest/globals";
import bcrypt from "bcrypt";
import * as openidClient from "openid-client";

jest.mock("../src/models/account.js", () => ({
  __esModule: true,
  Account: {
    findOne: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock("../src/models/domain.js", () => ({
  __esModule: true,
  Domain: {
    findOne: jest.fn(),
  },
}));

jest.mock("../src/config/config.js", () => ({
  __esModule: true,
  getClientUrl: jest.fn(() => "http://client.example"),
  getServerUrl: jest.fn(() => "http://auth.example"),
  getTokenSecret: jest.fn(() => "test-token-secret"),
}));

jest.mock("bcrypt", () => ({
  __esModule: true,
  default: {
    genSalt: jest.fn(),
    hash: jest.fn(),
    compare: jest.fn(),
  },
  genSalt: jest.fn(),
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { Account } from "../src/models/account.js";
import { Domain } from "../src/models/domain.js";
import {
  authenticateAccount,
  generateSSOLoginUrl,
  processSSOCallback,
  addAccount,
} from "../src/services/authentication.js";
import { getClientUrl } from "../src/config/config.js";

type DomainSelectResult = {
  authStrategy: "oidc" | "internal";
  ssoConfig: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
  } | null;
};

const mockedAccount: any = Account;
const mockedDomain: any = Domain;
const mockedBcrypt: any = bcrypt;
const mockedOpenId: any = openidClient;
const mockedGetClientUrl: any = getClientUrl;

describe("Authentication service branches", () => {
  const domainDoc: DomainSelectResult = {
    authStrategy: "oidc",
    ssoConfig: {
      issuerUrl: "https://idp.example",
      clientId: "client-123",
      clientSecret: "client-secret-123",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetClientUrl.mockReturnValue("http://client.example");
  });

  it("creates a new account with a hashed password", async () => {
    mockedAccount.findOne.mockResolvedValueOnce(null);
    mockedBcrypt.genSalt.mockResolvedValueOnce("salt-value");
    mockedBcrypt.hash.mockResolvedValueOnce("hashed-password");
    mockedAccount.create.mockResolvedValueOnce({
      name: "alice",
      email: "alice@example.com",
      password: "hashed-password",
      memberships: [],
    });

    const created = await addAccount(
      "alice",
      "alice@example.com",
      "plain-password",
    );

    expect(mockedBcrypt.genSalt).toHaveBeenCalledWith(10);
    expect(mockedBcrypt.hash).toHaveBeenCalledWith(
      "plain-password",
      "salt-value",
    );
    expect(mockedAccount.create).toHaveBeenCalledWith({
      name: "alice",
      email: "alice@example.com",
      password: "hashed-password",
      memberships: [],
    });
    expect(created.email).toBe("alice@example.com");
  });

  it("rejects duplicate account registrations", async () => {
    mockedAccount.findOne.mockResolvedValueOnce({ _id: "existing" });

    await expect(
      addAccount("alice", "alice@example.com", "plain-password"),
    ).rejects.toMatchObject({
      type: "Conflict Error",
      code: 409,
      message: "Account with this email or name already exists",
    });
  });

  it("rejects authentication when the account does not exist", async () => {
    mockedAccount.findOne.mockResolvedValueOnce(null);

    await expect(
      authenticateAccount("missing-user", "password"),
    ).rejects.toMatchObject({
      type: "Not Found Error",
      code: 404,
    });
  });

  it("rejects authentication when the password does not match", async () => {
    mockedAccount.findOne.mockResolvedValueOnce({
      name: "alice",
      password: "hashed-password",
    });
    mockedBcrypt.compare.mockResolvedValueOnce(false);

    await expect(
      authenticateAccount("alice", "wrong-password"),
    ).rejects.toMatchObject({
      type: "Validation Error",
      code: 400,
      message: "Invalid password",
    });
  });

  it("builds an SSO login URL with encoded state", async () => {
    const selectMock = jest
      .fn<() => Promise<DomainSelectResult>>()
      .mockResolvedValue(domainDoc);
    mockedDomain.findOne.mockReturnValue({ select: selectMock });
    mockedOpenId.discovery.mockResolvedValue({ issuer: "issuer" });
    mockedOpenId.randomPKCECodeVerifier.mockReturnValue("verifier-123");
    mockedOpenId.calculatePKCECodeChallenge.mockResolvedValue("challenge-123");
    mockedOpenId.buildAuthorizationUrl.mockImplementation(
      (_config: any, options: any) =>
        new URL(
          `https://idp.example/authorize?state=${encodeURIComponent(options.state)}&redirect_uri=${encodeURIComponent(options.redirect_uri)}&scope=${encodeURIComponent(options.scope)}`,
        ),
    );

    const redirectUrl = await generateSSOLoginUrl(
      "engineering.example",
      "alice",
    );

    const parsedUrl = new URL(redirectUrl);
    const state = parsedUrl.searchParams.get("state");
    expect(parsedUrl.searchParams.get("redirect_uri")).toBe(
      "http://auth.example/auth/sso/callback",
    );
    expect(parsedUrl.searchParams.get("scope")).toBe(
      "openid email profile groups",
    );
    expect(state).toBeTruthy();

    const decodedState = JSON.parse(Buffer.from(state!, "base64").toString());
    expect(decodedState).toEqual({
      cv_username: "alice",
      domain: "engineering.example",
      cv_verifier: "verifier-123",
    });
  });

  it("rejects SSO login when the domain is not OIDC-enabled", async () => {
    const selectMock = jest
      .fn<() => Promise<DomainSelectResult>>()
      .mockResolvedValue({
        authStrategy: "internal",
        ssoConfig: null,
      });
    mockedDomain.findOne.mockReturnValue({ select: selectMock });

    await expect(
      generateSSOLoginUrl("engineering.example", "alice"),
    ).rejects.toMatchObject({
      type: "Not Found Error",
      code: 404,
      message: "SSO not configured for this domain",
    });
  });

  it("processes the SSO callback and updates the account membership", async () => {
    const selectMock = jest
      .fn<() => Promise<DomainSelectResult>>()
      .mockResolvedValue(domainDoc);
    mockedDomain.findOne.mockReturnValue({ select: selectMock });
    mockedOpenId.discovery.mockResolvedValue({ issuer: "issuer" });
    mockedOpenId.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        sub: "external-user-42",
        groups: ["business-admin", "staff"],
      }),
    });
    mockedAccount.findOneAndUpdate.mockResolvedValue({});

    const state = Buffer.from(
      JSON.stringify({
        cv_username: "alice",
        domain: "engineering.example",
        cv_verifier: "verifier-123",
      }),
    ).toString("base64");

    const redirectUrl = await processSSOCallback(
      `http://auth.example/auth/sso/callback?code=abc123&state=${encodeURIComponent(state)}`,
    );

    expect(redirectUrl).toBe("http://client.example/domains?refresh=true");
    expect(mockedAccount.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      {
        name: "alice",
      },
      {
        $pull: {
          memberships: {
            domainName: "engineering.example",
          },
        },
      },
    );
    expect(mockedAccount.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      {
        name: "alice",
      },
      {
        $push: {
          memberships: {
            domainName: "engineering.example",
            role: "business_admin",
            externalId: "external-user-42",
          },
        },
      },
    );
  });

  it("rejects the SSO callback when state is missing", async () => {
    await expect(
      processSSOCallback("http://auth.example/auth/sso/callback?code=abc123"),
    ).rejects.toMatchObject({
      type: "Validation Error",
      code: 400,
      message: "Missing state parameter",
    });
  });
});

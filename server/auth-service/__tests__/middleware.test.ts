import { jest } from "@jest/globals";
import crypto from "crypto";

jest.mock("../src/services/tokenService.js", () => ({
  __esModule: true,
  verifyToken: jest.fn(),
}));

jest.mock("../src/config/config.js", () => ({
  __esModule: true,
  COOKIE_NAME: "authentication_token",
  getAdminSecret: jest.fn(() => "admin-secret"),
}));

import { COOKIE_NAME, getAdminSecret } from "../src/config/config.js";
import {
  requireAuthentication,
  requireHmacSignature,
} from "../src/controller/authenticationMiddleware.js";
import { NotFoundError, ForbiddenError, InternalError, ValidationError } from "../src/models/error.js";
import { verifyToken } from "../src/services/tokenService.js";

const mockedVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;
const mockedGetAdminSecret = getAdminSecret as jest.MockedFunction<typeof getAdminSecret>;

describe("Authentication middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAdminSecret.mockReturnValue("admin-secret");
  });

  it("rejects requests without an authentication cookie", () => {
    expect(() =>
      requireAuthentication(
        { cookies: {} } as any,
        {} as any,
        jest.fn(),
      ),
    ).toThrow(NotFoundError);
  });

  it("attaches the decoded account when the token is valid", () => {
    const next = jest.fn();
    const account = { accountName: "alice", accountId: "account-1" };
    mockedVerifyToken.mockReturnValue(account as any);

    const req = {
      cookies: {
        [COOKIE_NAME]: "signed-token",
      },
    } as any;

    requireAuthentication(req, {} as any, next);

    expect(mockedVerifyToken).toHaveBeenCalledWith("signed-token");
    expect(req.account).toEqual(account);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects HMAC verification when the admin secret is missing", () => {
    mockedGetAdminSecret.mockReturnValueOnce(undefined);

    expect(() =>
      requireHmacSignature(
        {
          headers: { "x-signature": "abc" },
          rawBody: Buffer.from("payload"),
        } as any,
        {} as any,
        jest.fn(),
      ),
    ).toThrow(InternalError);
  });

  it("rejects HMAC verification when the signature header is missing", () => {
    expect(() =>
      requireHmacSignature(
        {
          headers: {},
          rawBody: Buffer.from("payload"),
        } as any,
        {} as any,
        jest.fn(),
      ),
    ).toThrow(ForbiddenError);
  });

  it("rejects HMAC verification when the raw body is missing", () => {
    expect(() =>
      requireHmacSignature(
        {
          headers: { "x-signature": "abc" },
        } as any,
        {} as any,
        jest.fn(),
      ),
    ).toThrow(ValidationError);
  });

  it("rejects HMAC verification when the signature does not match", () => {
    expect(() =>
      requireHmacSignature(
        {
          headers: { "x-signature": "deadbeef" },
          rawBody: Buffer.from("payload"),
        } as any,
        {} as any,
        jest.fn(),
      ),
    ).toThrow(ForbiddenError);
  });

  it("accepts a valid HMAC signature", () => {
    const rawBody = Buffer.from("payload");
    const signature = crypto
      .createHmac("sha256", "admin-secret")
      .update(rawBody)
      .digest("hex");
    const next = jest.fn();

    requireHmacSignature(
      {
        headers: { "x-signature": signature },
        rawBody,
      } as any,
      {} as any,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});


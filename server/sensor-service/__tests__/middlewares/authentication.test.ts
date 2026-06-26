import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { requireAuthentication } from "src/middlewares/authentication.ts";

const SECRET = "test-jwt-secret";

describe("requireAuthentication", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    next = jest.fn();
    req = { cookies: {}, headers: {} };
    res = { status: statusMock } as unknown as Response;
  });

  it("rejects when no token is present", () => {
    requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", () => {
    req.headers = { authorization: "Bearer not-a-token" };
    requireAuthentication(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a valid cookie token and populates req.account", () => {
    const token = jwt.sign({ accountId: "u1", accountName: "alice" }, SECRET);
    req.cookies = { authentication_token: token };
    requireAuthentication(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect((req as Request).account?.accountName).toBe("alice");
  });

  it("accepts a forwarded bearer token", () => {
    const token = jwt.sign({ accountId: "u1", accountName: "svc" }, SECRET);
    req.headers = { authorization: `Bearer ${token}` };
    requireAuthentication(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });
});

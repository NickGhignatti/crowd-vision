import { describe, it, expect } from "@jest/globals";
import jwt from "jsonwebtoken";
import { authenticateToken, readCookie } from "../src/auth.js";

const SECRET = "test-secret";

// Mirrors the auth-service standard-token claim shape (token.ts).
function sign(
  claims: Record<string, unknown>,
  opts: jwt.SignOptions = {},
): string {
  return jwt.sign(claims, SECRET, opts);
}

describe("authenticateToken", () => {
  it("extracts identity and domain memberships from a valid token", () => {
    const token = sign({
      accountId: "acc-1",
      accountName: "alice",
      accountMemberships: [
        { domainName: "acme", role: "business_admin" },
        { domainName: "globex", role: "standard_customer" },
      ],
    });

    expect(authenticateToken(token, SECRET)).toEqual({
      accountId: "acc-1",
      accountName: "alice",
      domains: ["acme", "globex"],
    });
  });

  it("returns empty domains when there are no memberships", () => {
    const token = sign({ accountId: "acc-1", accountName: "alice" });
    expect(authenticateToken(token, SECRET)?.domains).toEqual([]);
  });

  it("drops membership entries without a string domainName", () => {
    const token = sign({
      accountId: "acc-1",
      accountName: "alice",
      accountMemberships: [{ domainName: "acme" }, { role: "x" }, {}],
    });
    expect(authenticateToken(token, SECRET)?.domains).toEqual(["acme"]);
  });

  it("returns null when accountId or accountName is missing", () => {
    expect(authenticateToken(sign({ accountName: "alice" }), SECRET)).toBeNull();
    expect(authenticateToken(sign({ accountId: "acc-1" }), SECRET)).toBeNull();
  });

  it("returns null for a token signed with a different secret", () => {
    const token = jwt.sign({ accountId: "a", accountName: "b" }, "other");
    expect(authenticateToken(token, SECRET)).toBeNull();
  });

  it("returns null for an expired token", () => {
    const token = sign(
      { accountId: "a", accountName: "b" },
      { expiresIn: "-1s" },
    );
    expect(authenticateToken(token, SECRET)).toBeNull();
  });

  it("returns null for a malformed token", () => {
    expect(authenticateToken("not-a-jwt", SECRET)).toBeNull();
  });

  it("returns null when token or secret is absent", () => {
    expect(authenticateToken(undefined, SECRET)).toBeNull();
    expect(authenticateToken(sign({ accountId: "a", accountName: "b" }), "")).toBeNull();
  });
});

describe("readCookie", () => {
  it("returns the value of the named cookie", () => {
    const header = "foo=1; authentication_token=abc.def.ghi; bar=2";
    expect(readCookie(header, "authentication_token")).toBe("abc.def.ghi");
  });

  it("url-decodes the cookie value", () => {
    expect(readCookie("k=a%20b", "k")).toBe("a b");
  });

  it("returns undefined when the cookie is absent", () => {
    expect(readCookie("foo=1; bar=2", "authentication_token")).toBeUndefined();
  });

  it("returns undefined when the header is missing", () => {
    expect(readCookie(undefined, "authentication_token")).toBeUndefined();
  });
});

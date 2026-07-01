import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/index.js";
import { COOKIE_NAME } from "../src/config/config.js";
import { Account } from "../src/models/account.js";
import { Domain } from "../src/models/domain.js";

/**
 * Route-level authorization tests for domain / subdomain creation.
 *
 * Two regressions are guarded here:
 *  1. Top-level `POST /domains` must only require a valid session — a fresh user
 *     with no memberships has no parent to authorize against and becomes the new
 *     domain's admin, so gating it on business_admin made the first domain
 *     impossible to create.
 *  2. Role-gated routes must authorize against CURRENT DB memberships, not the
 *     snapshot baked into the JWT at login. A user who just created/joined a
 *     domain hasn't re-logged in, so their token's membership list is stale.
 */
describe("Domain creation routes — authorization", () => {
  const SECRET = "test-domain-routes-secret";
  let previousSecret: string | undefined;

  beforeAll(() => {
    previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = SECRET;
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  // Sign a token whose membership snapshot is intentionally decoupled from the DB
  // so tests can simulate a stale token.
  const tokenFor = (
    accountName: string,
    accountMemberships: { domainName: string; role: string }[] = [],
  ) =>
    jwt.sign({ accountId: "acc-1", accountName, accountMemberships }, SECRET);

  const authCookie = (token: string) => `${COOKIE_NAME}=${token}`;

  const createAccount = (
    name: string,
    memberships: { domainName: string; role: string }[] = [],
  ) =>
    Account.create({
      name,
      email: `${name}@test.com`,
      password: "hashed",
      memberships,
    });

  describe("POST /domains (top-level)", () => {
    it("lets an authenticated user with no memberships create a top-level domain", async () => {
      const res = await request(app)
        .post("/domains")
        .set("Cookie", authCookie(tokenFor("regular-user", [])))
        .send({ name: "brand-new.org", authStrategy: "internal" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("brand-new.org");
    });

    it("lets a standard_customer create a top-level domain (not a 403)", async () => {
      const res = await request(app)
        .post("/domains")
        .set(
          "Cookie",
          authCookie(
            tokenFor("regular-user", [
              { domainName: "someone-else.org", role: "standard_customer" },
            ]),
          ),
        )
        .send({ name: "another-new.org", authStrategy: "internal" });

      expect(res.status).toBe(201);
    });

    it("rejects an unauthenticated request", async () => {
      const res = await request(app)
        .post("/domains")
        .send({ name: "no-auth.org", authStrategy: "internal" });

      expect(res.status).not.toBe(201);
      expect([401, 404]).toContain(res.status);
    });
  });

  describe("POST /subdomains/:domainName (admin-gated, DB-backed)", () => {
    it("authorizes a business_admin from the DB even when the JWT snapshot is stale", async () => {
      // DB says business_admin of kubeet; token carries an EMPTY membership list,
      // exactly the state right after creating the domain without re-logging in.
      await createAccount("admin-user", [
        { domainName: "kubeet", role: "business_admin" },
      ]);

      const res = await request(app)
        .post("/subdomains/kubeet")
        .set("Cookie", authCookie(tokenFor("admin-user", [])))
        .send({ name: "cs.kubeet", authStrategy: "internal" });

      expect(res.status).toBe(201);
    });

    it("returns 403 when the DB membership is below business_admin", async () => {
      await createAccount("member-user", [
        { domainName: "kubeet", role: "standard_customer" },
      ]);

      const res = await request(app)
        .post("/subdomains/kubeet")
        .set("Cookie", authCookie(tokenFor("member-user", [])))
        .send({ name: "cs.kubeet", authStrategy: "internal" });

      expect(res.status).toBe(403);
    });

    it("returns 403 when the account has no membership for the parent domain", async () => {
      await createAccount("outsider", [
        { domainName: "other.org", role: "business_admin" },
      ]);

      const res = await request(app)
        .post("/subdomains/kubeet")
        .set("Cookie", authCookie(tokenFor("outsider", [])))
        .send({ name: "cs.kubeet", authStrategy: "internal" });

      expect(res.status).toBe(403);
    });

    // Reproduces the reported bug: enterprise onboarding stored the domain as
    // "Kubeet" (mixed case), but the client lowercases the master domain in the
    // subdomain URL. Domain names are case-insensitive, so this must succeed and
    // link the subdomain to the existing parent.
    it("authorizes and links a subdomain when parent case differs from the URL", async () => {
      await createAccount("Kubeet-admin", [
        { domainName: "Kubeet", role: "business_admin" },
      ]);
      const parent = await Domain.create({
        name: "Kubeet",
        subdomains: [],
        authStrategy: "internal",
      });

      const res = await request(app)
        .post("/subdomains/kubeet")
        .set("Cookie", authCookie(tokenFor("Kubeet-admin", [])))
        .send({ name: "cs.kubeet", authStrategy: "internal" });

      expect(res.status).toBe(201);

      const created = await Domain.findOne({ name: "cs.kubeet" });
      const refreshedParent = await Domain.findById(parent._id);
      expect(created).not.toBeNull();
      expect(
        refreshedParent!.subdomains.map((s) => s.toString()),
      ).toContain(created!._id.toString());
    });
  });
});

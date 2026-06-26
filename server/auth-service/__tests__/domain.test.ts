import type { Request, Response } from "express";
import { Account } from "../src/models/account.js";
import { Domain } from "../src/models/domain.js";
import {
  authenticateAccount,
  addAccount,
} from "../src/services/authentication.js";
import {
  addDomain,
  getDomains,
  getAccountMemberships,
  getDomainSubdomains,
  getMemberCountsFor,
  subscribe,
  unsubscribe,
  sanitizeForLog,
} from "../src/services/domain.js";
import {
  getDomainsByAccount,
  subscribeAccountToDomain,
} from "../src/controller/domain.js";

describe("Domain API", () => {
  const mockUser = {
    username: "domainUser",
    email: "domain@test.com",
    password: "password123",
  };

  const subscriberUser = {
    username: "subscriberUser",
    email: "sub@test.com",
    password: "password123",
  };

  const mockDomain = {
    name: "unibo.it",
    subdomains: ["studio", "docenti"],
    creatorUsername: mockUser.username,
  };

  const createMockDomainWithSubdomains = async () => {
    return addDomain(
      mockDomain.name,
      [],
      mockDomain.creatorUsername,
      "internal",
    );
  };

  beforeEach(async () => {
    await Account.deleteMany({});
    await Domain.deleteMany({});

    await Domain.syncIndexes();
    await Account.syncIndexes();

    await addAccount(mockUser.username, mockUser.email, mockUser.password);
  });

  describe("1. System Domains", () => {
    it("should creation a new domain", async () => {
      const domain = await createMockDomainWithSubdomains();

      expect(domain.name).toBe(mockDomain.name);
      expect(domain.subdomains).toHaveLength(0);

      const subdomainNames = await getDomainSubdomains(mockDomain.name);
      expect(subdomainNames).toEqual(expect.arrayContaining([]));
    });

    it("should retrieve all system domains", async () => {
      await createMockDomainWithSubdomains();

      const domains = await getDomains();

      expect(domains.some((d) => d.name === mockDomain.name)).toBe(true);
    });

    it("should fail to creation a duplicate domain", async () => {
      await createMockDomainWithSubdomains();

      await expect(createMockDomainWithSubdomains()).rejects.toThrow();
    });
  });

  describe("Account Domains & Subscriptions", () => {
    beforeEach(async () => {
      await createMockDomainWithSubdomains();
    });

    it("should verify the creator is a business admin", async () => {
      const userDomains = await getAccountMemberships(mockUser.username);

      const membership = userDomains.find(
        (m) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("business_admin");
    });

    it("should allow a user to SUBSCRIBE to a domain", async () => {
      const newAccount = await addAccount("sub", "sub@gmail.com", "sub");
      const subscribed = await subscribe(newAccount.name, mockDomain.name);

      expect(subscribed).toBeUndefined();
      const userDomains = await getAccountMemberships(newAccount.name);

      const membership = userDomains.find(
        (m) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("standard_customer");
    });

    it("should allow a user to UNSUBSCRIBE", async () => {
      const newAccount = await addAccount("sub", "sub@gmail.com", "sub");
      await subscribe(newAccount.name, mockDomain.name);
      await expect(
        unsubscribe(newAccount.name, mockDomain.name),
      ).resolves.not.toThrow();

      const memberships = await getAccountMemberships(newAccount.name);
      const membership = memberships.find(
        (m: any) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeUndefined();
    });
  });

  describe("IDOR protection: identity is bound to the token", () => {
    beforeEach(async () => {
      await createMockDomainWithSubdomains();
    });

    // Helper: a minimal res that captures the JSON body.
    const captureRes = () => {
      const body: { value?: unknown } = {};
      const res = {
        json: (payload: unknown) => {
          body.value = payload;
          return res;
        },
        status: () => res,
        send: () => res,
      } as unknown as Response;
      return { res, body };
    };

    it("getDomainsByAccount ignores the URL param and uses the token account", async () => {
      // mockUser is business_admin of the domain; attacker has no memberships.
      await addAccount("attacker", "attacker@test.com", "password123");

      const { res, body } = captureRes();
      await getDomainsByAccount(
        {
          account: { accountName: "attacker" },
          params: { accountName: mockUser.username },
        } as unknown as Request,
        res,
      );

      // Must return attacker's (empty) memberships, NOT mockUser's domain.
      expect((body.value as { domains: unknown[] }).domains).toHaveLength(0);
    });

    it("subscribeAccountToDomain subscribes the token account, not the URL param", async () => {
      await addAccount("attacker", "attacker@test.com", "password123");

      const { res } = captureRes();
      await subscribeAccountToDomain(
        {
          account: { accountName: "attacker" },
          params: { accountName: mockUser.username },
          body: { domainName: mockDomain.name },
        } as unknown as Request,
        res,
      );

      // The attacker (token identity) is subscribed — the param was ignored.
      const attackerMemberships = await getAccountMemberships("attacker");
      expect(
        attackerMemberships.some((m) => m.domainName === mockDomain.name),
      ).toBe(true);
    });
  });

  describe("Member counts", () => {
    beforeEach(async () => {
      await createMockDomainWithSubdomains();
    });

    it("counts members per domain, restricted to the requested names", async () => {
      const sub = await addAccount("sub", "sub@gmail.com", "sub");
      await subscribe(sub.name, mockDomain.name);

      const counts = await getMemberCountsFor([mockDomain.name]);

      // creator (business_admin) + one subscriber
      expect(counts[mockDomain.name]).toBe(2);
    });

    it("omits domains with no members and returns {} for an empty request", async () => {
      const counts = await getMemberCountsFor(["nonexistent.it"]);
      expect(counts["nonexistent.it"]).toBeUndefined();

      expect(await getMemberCountsFor([])).toEqual({});
    });
  });
});

describe("sanitizeForLog", () => {
  it("strips newlines so user input cannot forge log entries", () => {
    expect(sanitizeForLog("evil\nINFO admin logged in")).toBe(
      "evilINFO admin logged in",
    );
  });

  it("strips carriage returns and CRLF sequences", () => {
    expect(sanitizeForLog("a\rb\r\nc")).toBe("abc");
  });

  it("removes every line break, not just the first", () => {
    expect(sanitizeForLog("a\nb\nc\nd")).toBe("abcd");
  });

  it("leaves a clean domain id untouched", () => {
    expect(sanitizeForLog("studio.unibo.it")).toBe("studio.unibo.it");
  });

  it("preserves percent signs (format specifiers are neutralised by position, not content)", () => {
    expect(sanitizeForLog("%s%d")).toBe("%s%d");
  });

  it("returns an empty string unchanged", () => {
    expect(sanitizeForLog("")).toBe("");
  });
});

import request from "supertest";
import { app } from "../src/index.js";
import { Account } from "../src/models/account.js";
import { Domain } from "../src/models/domain.js";
import {
  authenticateAccount,
  registerAccount,
} from "../src/services/authenticationService.js";
import {
  createDomain,
  getAllDomains,
  getAccountMemberships, subscribeInternal, unsubscribe,
} from "../src/services/domainService.js";

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

  beforeEach(async () => {
    await Account.deleteMany({});
    await Domain.deleteMany({});

    await Domain.syncIndexes();
    await Account.syncIndexes();

    await registerAccount(mockUser.username, mockUser.email, mockUser.password);
  });

  describe("1. System Domains", () => {
    it("should create a new domain", async () => {
      const domain = await createDomain(
        mockDomain.name,
        mockDomain.subdomains,
        mockDomain.creatorUsername,
        "internal",
      );

      expect(domain.name).toBe(mockDomain.name);
      expect(domain.subdomains).toEqual(
        expect.arrayContaining(mockDomain.subdomains),
      );
    });

    it("should retrieve all system domains", async () => {
      await createDomain(
        mockDomain.name,
        mockDomain.subdomains,
        mockDomain.creatorUsername,
        "internal",
      );

      const domains = await getAllDomains();

      expect(domains.length).toBe(1);
      expect(domains[0]).toBeDefined();
      if (domains[0]) {
        expect(domains[0].name).toBe(mockDomain.name);
      }
    });

    it("should fail to create a duplicate domain", async () => {
      await createDomain(
        mockDomain.name,
        mockDomain.subdomains,
        mockDomain.creatorUsername,
        "internal",
      );

      await expect(
        createDomain(
          mockDomain.name,
          mockDomain.subdomains,
          mockDomain.creatorUsername,
          "internal",
        ),
      ).rejects.toThrow();
    });
  });

  describe("Account Domains & Subscriptions", () => {
    beforeEach(async () => {
      await createDomain(
        mockDomain.name,
        mockDomain.subdomains,
        mockDomain.creatorUsername,
        "internal",
      );
    });

    it("should verify the creator is the OWNER", async () => {
      const userDomains = await getAccountMemberships(mockUser.username);

      const membership = userDomains.find(
        (m) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("owner");
    });

    it("should allow a user to SUBSCRIBE to a domain", async () => {
      const newAccount = await registerAccount("sub", "sub@gmail.com", "sub");
      const subscribed = await subscribeInternal(newAccount.name, mockDomain.name);

      expect(subscribed).toBeUndefined();
      const userDomains = await getAccountMemberships(newAccount.name);

      const membership = userDomains.find(
        (m) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("viewer");
    });

    it("should allow a user to UNSUBSCRIBE", async () => {
      const newAccount = await registerAccount("sub", "sub@gmail.com", "sub");
      await subscribeInternal(
        newAccount.name,
        mockDomain.name,
      );
      await expect(unsubscribe(newAccount.name, mockDomain.name)).resolves.not.toThrow();

      const memberships = await getAccountMemberships(newAccount.name);
      const membership = memberships.find(
        (m: any) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeUndefined();
    });
  });
});

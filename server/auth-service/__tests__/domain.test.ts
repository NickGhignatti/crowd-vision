import { Account } from "../src/models/account.js";
import { Domain } from "../src/models/domain.js";
import {
  authenticateAccount,
  registerAccount,
} from "../src/services/authenticationService.js";
import {
  createDomain,
  getAllDomains,
  getAccountMemberships,
  getDomainSubdomains,
  subscribeInternal,
  unsubscribe,
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

  const createMockDomainWithSubdomains = async () => {
    return createDomain(
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

    await registerAccount(mockUser.username, mockUser.email, mockUser.password);
  });

  describe("1. System Domains", () => {
    it("should create a new domain", async () => {
      const domain = await createMockDomainWithSubdomains();

      expect(domain.name).toBe(mockDomain.name);
      expect(domain.subdomains).toHaveLength(0);

      const subdomainNames = await getDomainSubdomains(mockDomain.name);
      expect(subdomainNames).toEqual(expect.arrayContaining([]));
    });

    it("should retrieve all system domains", async () => {
      await createMockDomainWithSubdomains();

      const domains = await getAllDomains();

      expect(domains.some((d) => d.name === mockDomain.name)).toBe(true);
    });

    it("should fail to create a duplicate domain", async () => {
      await createMockDomainWithSubdomains();

      await expect(
        createMockDomainWithSubdomains(),
      ).rejects.toThrow();
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
      const newAccount = await registerAccount("sub", "sub@gmail.com", "sub");
      const subscribed = await subscribeInternal(newAccount.name, mockDomain.name);

      expect(subscribed).toBeUndefined();
      const userDomains = await getAccountMemberships(newAccount.name);

      const membership = userDomains.find(
        (m) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("standard_customer");
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

import request from "supertest";
import { app } from "../src/index.js";
import { User } from "../src/models/user.js";
import { Domain } from "../src/models/domain.js";
import {
  authenticateUser,
  registerUser,
} from "../src/services/authenticationService.js";
import {
  createDomain,
  getAllDomains,
  getUserMemberships, subscribeInternal, unsubscribe,
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
    await User.deleteMany({});
    await Domain.deleteMany({});

    await Domain.syncIndexes();
    await User.syncIndexes();

    await registerUser(mockUser.username, mockUser.email, mockUser.password);
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

  describe("User Domains & Subscriptions", () => {
    beforeEach(async () => {
      await createDomain(
        mockDomain.name,
        mockDomain.subdomains,
        mockDomain.creatorUsername,
        "internal",
      );
    });

    it("should verify the creator is the OWNER", async () => {
      const userDomains = await getUserMemberships(mockUser.username);

      const membership = userDomains.find(
        (m) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("owner");
    });

    it("should allow a user to SUBSCRIBE to a domain", async () => {
      const newUser = await registerUser("sub", "sub@gmail.com", "sub");
      const subscribed = await subscribeInternal(newUser.username, mockDomain.name);

      expect(subscribed).toBeUndefined();
      const userDomains = await getUserMemberships(newUser.username);

      const membership = userDomains.find(
        (m) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("viewer");
    });

    it("should allow a user to UNSUBSCRIBE", async () => {
      const newUser = await registerUser("sub", "sub@gmail.com", "sub");
      await subscribeInternal(
        newUser.username,
        mockDomain.name,
      );
      await expect(unsubscribe(newUser.username, mockDomain.name)).resolves.not.toThrow();

      const memberships = await getUserMemberships(newUser.username);
      const membership = memberships.find(
        (m: any) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeUndefined();
    });
  });
});

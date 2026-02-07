import request from "supertest";
import { app } from "../src/index.js";
import mongoose from "mongoose";
import { User } from "../src/models/user.js";
import { Domain } from "../src/models/domain.js";

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
    authStrategy: "internal",
  };

  beforeEach(async () => {
    await User.deleteMany({});
    await Domain.deleteMany({});

    await Domain.syncIndexes();
    await User.syncIndexes();

    await request(app).post("/register").send(mockUser);
  });

  describe("System Domains", () => {
    it("should create a new system domain", async () => {
      const res = await request(app).post("/domains").send(mockDomain);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("name", mockDomain.name);
      expect(res.body.subdomains).toEqual(
        expect.arrayContaining(mockDomain.subdomains),
      );
    });

    it("should retrieve all system domains", async () => {
      await request(app).post("/domains").send(mockDomain);

      const res = await request(app).get("/domains");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("domains");
      expect(Array.isArray(res.body.domains)).toBe(true);

      const found = res.body.domains.find(
        (d: any) => d.name === mockDomain.name,
      );
      expect(found).toBeDefined();
    });

    it("should fail to create a duplicate domain", async () => {
      await request(app).post("/domains").send(mockDomain);
      const res = await request(app).post("/domains").send(mockDomain);

      expect(res.status).toBe(400);
    });
  });

  describe("User Domains & Subscriptions", () => {
    beforeEach(async () => {
      await request(app).post("/domains").send(mockDomain);
      await request(app).post("/register").send(subscriberUser);
    });

    it("should verify the creator is the OWNER", async () => {
      const res = await request(app).get(`/domains/${mockUser.username}`);
      expect(res.status).toBe(200);

      const membership = res.body.domains.find(
        (m: any) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership.role).toBe("owner");
    });

    it("should allow a user to SUBSCRIBE to a domain", async () => {
      const res = await request(app)
        .post(`/domains/${subscriberUser.username}/subscribe`)
        .send({ domainName: mockDomain.name });

      expect(res.status).toBe(200);

      const checkRes = await request(app).get(
        `/domains/${subscriberUser.username}`,
      );
      expect(checkRes.status).toBe(200);

      const membership = checkRes.body.domains.find(
        (m: any) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeDefined();
      expect(membership.role).toBe("viewer");
    });

    it("should allow a user to UNSUBSCRIBE", async () => {
      await request(app)
        .post(`/domains/${subscriberUser.username}/subscribe`)
        .send({ domainName: mockDomain.name });

      const res = await request(app)
        .delete(`/domains/${subscriberUser.username}/unsubscribe`)
        .send({ domainName: mockDomain.name });

      expect(res.status).toBe(200);

      const checkRes = await request(app).get(
        `/domains/${subscriberUser.username}`,
      );
      const membership = checkRes.body.domains.find(
        (m: any) => m.domainName === mockDomain.name,
      );
      expect(membership).toBeUndefined();
    });
  });
});

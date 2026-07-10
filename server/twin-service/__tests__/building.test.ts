import request from "supertest";
import jwt from "jsonwebtoken";
import { generateKeyPairSync } from "crypto";
import { app } from "../src/index.js";
import { Building } from "../src/models/building.js";
import { resetGatewayJwksCacheForTests } from "../src/config/gatewayJwks.js";

const mockBuilding = {
  name: "Engineering Block",
  domains: ["test-domain"],
  rooms: [
    {
      id: "Room-101",
      name: "Room 101",
      capacity: 20,
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 10, height: 10, depth: 10 },
      color: "#ffffff",
    },
  ],
};

const GATEWAY_ISSUER = "cv-gateway";
const GATEWAY_JWKS_URI = "http://gateway.test/.well-known/jwks.json";
const KID = "test-kid";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

// Mint a JWT the auth middleware accepts and attach it as a bearer token. Every
// data route is now authenticated, so each request must carry it. The caller is
// a member of "test-domain" only, so domain-scoped routes can be exercised for
// both the allowed and denied cases.
const token = jwt.sign(
  {
    sub: "u1",
    accountName: "tester",
    memberships: [{ domain: "test-domain", role: "standard_customer" }],
  },
  privateKey,
  { algorithm: "RS256", keyid: KID, issuer: GATEWAY_ISSUER, expiresIn: "1h" },
);
const auth = <T extends request.Test>(req: T): T =>
  req.set("Authorization", `Bearer ${token}`) as T;

const realFetch = global.fetch;

beforeAll(() => {
  process.env.GATEWAY_JWKS_URI = GATEWAY_JWKS_URI;
  process.env.GATEWAY_ISSUER = GATEWAY_ISSUER;
  resetGatewayJwksCacheForTests();
  const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ keys: [{ kty: "RSA", kid: KID, use: "sig", alg: "RS256", n: jwk.n, e: jwk.e }] }),
  })) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe("Twin Service API", () => {
  describe("authentication", () => {
    it("rejects requests without a token", async () => {
      const res = await request(app).post("/register").send(mockBuilding);
      expect(res.status).toBe(401);
    });

    it("rejects requests with an invalid token", async () => {
      const res = await request(app)
        .get("/building/anything")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(401);
    });

    it("keeps /health public", async () => {
      const res = await request(app).get("/health/");
      expect(res.status).toBe(200);
    });

    it("accepts a valid token from the cookie", async () => {
      const res = await request(app)
        .get("/buildings/test-domain")
        .set("Cookie", `authentication_token=${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe("tenant scoping (IDOR protection)", () => {
    it("denies GET /buildings/:domain for a domain the caller doesn't belong to", async () => {
      const res = await auth(request(app).get("/buildings/someone-elses-domain"));
      expect(res.status).toBe(403);
    });

    it("allows GET /buildings/:domain for a domain the caller belongs to", async () => {
      const res = await auth(request(app).get("/buildings/test-domain"));
      expect(res.status).toBe(200);
    });

    it("drops domains the caller doesn't belong to from POST /buildings/counts", async () => {
      await auth(request(app).post("/register")).send(mockBuilding);

      const res = await auth(request(app).post("/buildings/counts")).send({
        domains: ["test-domain", "someone-elses-domain"],
      });

      expect(res.status).toBe(200);
      expect(res.body.counts["test-domain"]).toBe(1);
      expect(res.body.counts["someone-elses-domain"]).toBeUndefined();
    });
  });

  describe("POST /register", () => {
    it("registers a new building and returns an auto-generated id", async () => {
      const res = await auth(request(app).post("/register")).send(mockBuilding);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(typeof res.body.id).toBe("string");
      expect(res.body.name).toBe(mockBuilding.name);
      expect(res.body.rooms).toHaveLength(1);

      const inDb = await Building.findOne({ id: res.body.id });
      expect(inDb).toBeTruthy();
      expect(inDb?.name).toBe(mockBuilding.name);
    });

    it("generates a different id for each registration", async () => {
      const r1 = await auth(request(app).post("/register")).send(mockBuilding);
      const r2 = await auth(request(app).post("/register")).send(mockBuilding);

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      expect(r1.body.id).not.toBe(r2.body.id);
    });

    it("falls back to 'Building' as name when name is omitted", async () => {
      const { name: _ignored, ...payloadWithoutName } = mockBuilding;

      const res = await auth(request(app).post("/register")).send(
        payloadWithoutName,
      );

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Building");

      const inDb = await Building.findOne({ id: res.body.id });
      expect(inDb?.name).toBe("Building");
    });

    it("ignores any id field sent by the client", async () => {
      const res = await auth(request(app).post("/register")).send({
        ...mockBuilding,
        id: "client-chosen-id",
      });

      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe("client-chosen-id");
    });
  });

  describe("GET /building/:id", () => {
    it("retrieves a building by its auto-generated id", async () => {
      const registerRes = await auth(request(app).post("/register")).send(
        mockBuilding,
      );
      const buildingId = registerRes.body.id;

      const res = await auth(request(app).get(`/building/${buildingId}`));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(buildingId);
    });

    it("returns 404 if building not found", async () => {
      const res = await auth(request(app).get("/building/NON_EXISTENT"));
      expect(res.status).toBe(404);
    });
  });

  describe("GET /buildings/:domain", () => {
    it("retrieves buildings for a specific domain", async () => {
      await auth(request(app).post("/register")).send(mockBuilding);
      await auth(request(app).post("/register")).send(mockBuilding);

      const res = await auth(
        request(app).get(`/buildings/${mockBuilding.domains[0]}`),
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it("returns an empty list if no buildings found for domain", async () => {
      const res = await auth(request(app).get("/buildings/test-domain"));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("POST /buildings/counts", () => {
    it("returns building counts only for the requested domains", async () => {
      await auth(request(app).post("/register")).send(mockBuilding);
      await auth(request(app).post("/register")).send(mockBuilding);

      const res = await auth(request(app).post("/buildings/counts")).send({
        domains: [mockBuilding.domains[0], "unknown-domain"],
      });

      expect(res.status).toBe(200);
      expect(res.body.counts[mockBuilding.domains[0] as string]).toBe(2);
      expect(res.body.counts["unknown-domain"]).toBeUndefined();
    });

    it("returns an empty map for an empty request", async () => {
      const res = await auth(request(app).post("/buildings/counts")).send({
        domains: [],
      });

      expect(res.status).toBe(200);
      expect(res.body.counts).toEqual({});
    });

    it("rejects a non-array domains payload", async () => {
      const res = await auth(request(app).post("/buildings/counts")).send({
        domains: "not-an-array",
      });

      expect(res.status).toBe(400);
    });

    it("rejects an oversized domains payload", async () => {
      const domains = Array.from({ length: 501 }, (_, i) => `d-${i}`);

      const res = await auth(request(app).post("/buildings/counts")).send({
        domains,
      });

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /building/:buildingId/room/:roomId", () => {
    let buildingId: string;

    beforeEach(async () => {
      const res = await auth(request(app).post("/register")).send(mockBuilding);
      buildingId = res.body.id;
    });

    it("updates room details (capacity, color and name)", async () => {
      const updates = { capacity: 50, color: "#ff0000", name: "Physics Lab" };

      const res = await auth(
        request(app).patch(`/building/${buildingId}/room/Room-101`),
      ).send(updates);

      expect(res.status).toBe(200);
      expect(res.body.capacity).toBe(50);
      expect(res.body.color).toBe("#ff0000");
      expect(res.body.name).toBe("Physics Lab");

      const updatedBuilding = await Building.findOne({ id: buildingId });
      const room = updatedBuilding?.rooms.find((r) => r.id === "Room-101");
      expect(room?.capacity).toBe(50);
      expect(room?.name).toBe("Physics Lab");
    });

    it("returns 404 if building not found", async () => {
      const res = await auth(
        request(app).patch("/building/FAKE_BUILDING/room/Room-101"),
      ).send({ capacity: 50 });

      expect(res.status).toBe(404);
    });

    it("returns 404 if room not found", async () => {
      const res = await auth(
        request(app).patch(`/building/${buildingId}/room/FAKE_ROOM`),
      ).send({ capacity: 50 });

      expect(res.status).toBe(404);
      expect(res.body.type).toBeDefined();
      expect(res.body.message.toLowerCase()).toContain("room");
    });
  });

  describe("PATCH /building/:buildingId", () => {
    it("updates building name", async () => {
      const registerRes = await auth(request(app).post("/register")).send(
        mockBuilding,
      );
      const buildingId = registerRes.body.id;

      const res = await auth(request(app).patch(`/building/${buildingId}`)).send(
        { name: "New Building Name" },
      );

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New Building Name");

      const inDb = await Building.findOne({ id: buildingId });
      expect(inDb?.name).toBe("New Building Name");
    });
  });
});

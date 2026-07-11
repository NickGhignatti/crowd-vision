import request from "supertest";
import { app } from "../src/index.js";
import { Building } from "../src/models/building.js";

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

const claimsHeader = (payload: object): string =>
  Buffer.from(JSON.stringify(payload)).toString("base64");

// The mesh (Istio, or Caddy+claims-gateway/verify) verifies the caller once
// at the edge and injects this header — twin-service just decodes it. Every
// data route requires it, so each request must carry it. The caller is a
// member of "test-domain" only, so domain-scoped routes can be exercised for
// both the allowed and denied cases.
const token = claimsHeader({
  sub: "u1",
  accountName: "tester",
  memberships: [{ domain: "test-domain", role: "standard_customer" }],
});
const auth = <T extends request.Test>(req: T): T =>
  req.set("x-gateway-claims", token) as T;

// Geometry-mutating routes require an editing role in the building's own
// domain, not just membership — this caller can edit "test-domain" only.
const editorToken = claimsHeader({
  sub: "u2",
  accountName: "editor",
  memberships: [{ domain: "test-domain", role: "business_admin" }],
});
const authEditor = <T extends request.Test>(req: T): T =>
  req.set("x-gateway-claims", editorToken) as T;

describe("Twin Service API", () => {
  describe("authentication", () => {
    it("rejects requests without a token", async () => {
      const res = await request(app).post("/register").send(mockBuilding);
      expect(res.status).toBe(401);
    });

    it("rejects requests with a malformed claims header", async () => {
      const res = await request(app)
        .get("/building/anything")
        .set("x-gateway-claims", "not-valid-base64-json");
      expect(res.status).toBe(401);
    });

    it("keeps /health public", async () => {
      const res = await request(app).get("/health/");
      expect(res.status).toBe(200);
    });

    it("accepts a valid claims header", async () => {
      const res = await auth(request(app).get("/buildings/test-domain"));
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

      const res = await authEditor(
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

    it("persists position and dimensions", async () => {
      const updates = {
        position: { x: 5, y: 0, z: -2 },
        dimensions: { width: 4, height: 3, depth: 6 },
      };

      const res = await authEditor(
        request(app).patch(`/building/${buildingId}/room/Room-101`),
      ).send(updates);

      expect(res.status).toBe(200);
      expect(res.body.position).toEqual(updates.position);
      expect(res.body.dimensions).toEqual(updates.dimensions);

      const updatedBuilding = await Building.findOne({ id: buildingId });
      const room = updatedBuilding?.rooms.find((r) => r.id === "Room-101");
      expect(room?.position.x).toBe(updates.position.x);
      expect(room?.position.y).toBe(updates.position.y);
      expect(room?.position.z).toBe(updates.position.z);
      expect(room?.dimensions.width).toBe(updates.dimensions.width);
      expect(room?.dimensions.height).toBe(updates.dimensions.height);
      expect(room?.dimensions.depth).toBe(updates.dimensions.depth);
    });

    it("rejects non-positive dimensions", async () => {
      const res = await authEditor(
        request(app).patch(`/building/${buildingId}/room/Room-101`),
      ).send({ dimensions: { width: 0, height: 3, depth: 6 } });

      expect(res.status).toBe(400);
    });

    it("rejects non-finite position coordinates", async () => {
      const res = await authEditor(
        request(app).patch(`/building/${buildingId}/room/Room-101`),
      ).send({ position: { x: Number.NaN, y: 0, z: 0 } });

      expect(res.status).toBe(400);
    });

    it("returns 404 if building not found", async () => {
      const res = await authEditor(
        request(app).patch("/building/FAKE_BUILDING/room/Room-101"),
      ).send({ capacity: 50 });

      expect(res.status).toBe(404);
    });

    it("returns 404 if room not found", async () => {
      const res = await authEditor(
        request(app).patch(`/building/${buildingId}/room/FAKE_ROOM`),
      ).send({ capacity: 50 });

      expect(res.status).toBe(404);
      expect(res.body.type).toBeDefined();
      expect(res.body.message.toLowerCase()).toContain("room");
    });

    it("denies a member without an editing role", async () => {
      const res = await auth(
        request(app).patch(`/building/${buildingId}/room/Room-101`),
      ).send({ capacity: 50 });

      expect(res.status).toBe(403);
    });

    it("denies an editor whose editing role is in a different domain", async () => {
      const otherBuildingRes = await auth(request(app).post("/register")).send({
        ...mockBuilding,
        domains: ["someone-elses-domain"],
      });

      const res = await authEditor(
        request(app).patch(
          `/building/${otherBuildingRes.body.id}/room/Room-101`,
        ),
      ).send({ capacity: 50 });

      expect(res.status).toBe(403);
    });
  });

  describe("POST /building/:buildingId/room", () => {
    let buildingId: string;

    beforeEach(async () => {
      const res = await auth(request(app).post("/register")).send(mockBuilding);
      buildingId = res.body.id;
    });

    it("creates a room with a server-assigned id", async () => {
      const payload = {
        name: "Room 202",
        capacity: 15,
        position: { x: 1, y: 0, z: 1 },
        dimensions: { width: 3, height: 3, depth: 3 },
        color: "#00ff00",
      };

      const res = await authEditor(
        request(app).post(`/building/${buildingId}/room`),
      ).send(payload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe("Room 202");

      const inDb = await Building.findOne({ id: buildingId });
      expect(inDb?.rooms).toHaveLength(2);
      expect(inDb?.rooms.some((r) => r.id === res.body.id)).toBe(true);
    });

    it("rejects invalid geometry", async () => {
      const res = await authEditor(
        request(app).post(`/building/${buildingId}/room`),
      ).send({
        name: "Bad room",
        capacity: 1,
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: -1, height: 1, depth: 1 },
      });

      expect(res.status).toBe(400);
    });

    it("denies a member without an editing role", async () => {
      const res = await auth(request(app).post(`/building/${buildingId}/room`)).send({
        name: "Room X",
        capacity: 1,
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 1, height: 1, depth: 1 },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /building/:buildingId/room/:roomId", () => {
    let buildingId: string;

    beforeEach(async () => {
      const res = await auth(request(app).post("/register")).send({
        ...mockBuilding,
        rooms: [
          ...mockBuilding.rooms,
          {
            id: "Room-102",
            name: "Room 102",
            capacity: 10,
            position: { x: 10, y: 0, z: 0 },
            dimensions: { width: 5, height: 5, depth: 5 },
          },
        ],
      });
      buildingId = res.body.id;
    });

    it("deletes a room", async () => {
      const res = await authEditor(
        request(app).delete(`/building/${buildingId}/room/Room-102`),
      );

      expect(res.status).toBe(204);

      const inDb = await Building.findOne({ id: buildingId });
      expect(inDb?.rooms.some((r) => r.id === "Room-102")).toBe(false);
    });

    it("blocks deleting the last room", async () => {
      await authEditor(
        request(app).delete(`/building/${buildingId}/room/Room-102`),
      );

      const res = await authEditor(
        request(app).delete(`/building/${buildingId}/room/Room-101`),
      );

      expect(res.status).toBe(400);

      const inDb = await Building.findOne({ id: buildingId });
      expect(inDb?.rooms).toHaveLength(1);
    });

    it("returns 404 for an unknown room", async () => {
      const res = await authEditor(
        request(app).delete(`/building/${buildingId}/room/NOPE`),
      );

      expect(res.status).toBe(404);
    });

    it("denies a member without an editing role", async () => {
      const res = await auth(
        request(app).delete(`/building/${buildingId}/room/Room-102`),
      );

      expect(res.status).toBe(403);
    });
  });

  describe("PUT /building/:buildingId/rooms", () => {
    let buildingId: string;

    beforeEach(async () => {
      const res = await auth(request(app).post("/register")).send(mockBuilding);
      buildingId = res.body.id;
    });

    it("atomically replaces the rooms array", async () => {
      const rooms = [
        {
          id: "Room-101",
          name: "Room 101 (moved)",
          capacity: 20,
          position: { x: 3, y: 0, z: 3 },
          dimensions: { width: 10, height: 10, depth: 10 },
        },
        {
          id: "Room-new",
          name: "Brand new room",
          capacity: 5,
          position: { x: 20, y: 0, z: 0 },
          dimensions: { width: 4, height: 4, depth: 4 },
        },
      ];

      const res = await authEditor(
        request(app).put(`/building/${buildingId}/rooms`),
      ).send({ rooms });

      expect(res.status).toBe(200);
      expect(res.body.rooms).toHaveLength(2);

      const inDb = await Building.findOne({ id: buildingId });
      expect(inDb?.rooms).toHaveLength(2);
      expect(inDb?.rooms.find((r) => r.id === "Room-101")?.position.x).toBe(3);
      expect(inDb?.rooms.some((r) => r.id === "Room-new")).toBe(true);
    });

    it("rejects the whole request if any room is invalid (no partial write)", async () => {
      const rooms = [
        {
          id: "Room-101",
          name: "Room 101",
          capacity: 20,
          position: { x: 0, y: 0, z: 0 },
          dimensions: { width: 10, height: 10, depth: 10 },
        },
        {
          id: "Room-bad",
          name: "Bad room",
          capacity: 1,
          position: { x: 0, y: 0, z: 0 },
          dimensions: { width: -1, height: 1, depth: 1 },
        },
      ];

      const res = await authEditor(
        request(app).put(`/building/${buildingId}/rooms`),
      ).send({ rooms });

      expect(res.status).toBe(400);

      const inDb = await Building.findOne({ id: buildingId });
      expect(inDb?.rooms).toHaveLength(1);
      expect(inDb?.rooms[0]?.id).toBe("Room-101");
    });

    it("rejects duplicate room ids", async () => {
      const rooms = [
        {
          id: "Room-101",
          name: "A",
          capacity: 1,
          position: { x: 0, y: 0, z: 0 },
          dimensions: { width: 1, height: 1, depth: 1 },
        },
        {
          id: "Room-101",
          name: "B",
          capacity: 1,
          position: { x: 1, y: 0, z: 0 },
          dimensions: { width: 1, height: 1, depth: 1 },
        },
      ];

      const res = await authEditor(
        request(app).put(`/building/${buildingId}/rooms`),
      ).send({ rooms });

      expect(res.status).toBe(400);
    });

    it("rejects an empty rooms array", async () => {
      const res = await authEditor(
        request(app).put(`/building/${buildingId}/rooms`),
      ).send({ rooms: [] });

      expect(res.status).toBe(400);
    });

    it("denies a member without an editing role", async () => {
      const res = await auth(
        request(app).put(`/building/${buildingId}/rooms`),
      ).send({ rooms: mockBuilding.rooms });

      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /building/:buildingId", () => {
    it("updates building name", async () => {
      const registerRes = await auth(request(app).post("/register")).send(
        mockBuilding,
      );
      const buildingId = registerRes.body.id;

      const res = await authEditor(
        request(app).patch(`/building/${buildingId}`),
      ).send({ name: "New Building Name" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New Building Name");

      const inDb = await Building.findOne({ id: buildingId });
      expect(inDb?.name).toBe("New Building Name");
    });

    it("denies a member without an editing role", async () => {
      const registerRes = await auth(request(app).post("/register")).send(
        mockBuilding,
      );
      const buildingId = registerRes.body.id;

      const res = await auth(request(app).patch(`/building/${buildingId}`)).send(
        { name: "New Building Name" },
      );

      expect(res.status).toBe(403);
    });
  });
});

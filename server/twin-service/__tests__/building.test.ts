import request from "supertest";
import { app } from "../src/index.js";
import { Building } from "../src/models/building.js";

const mockBuilding = {
  id: "Buildings-Test-001",
  name: "Engineering Block",
  domains: ["test-domain"],
  rooms: [
    {
      id: "Room-101",
      name: "Room 101",
      capacity: 20,
      temperature: 22,
      no_person: 0,
      position: { x: 0, y: 0, z: 0 },
      dimensions: { width: 10, height: 10, depth: 10 },
      color: "#ffffff",
    },
  ],
};

describe("Twin Service API", () => {
  describe("POST /register", () => {
    it("should register a new building successfully", async () => {
      const res = await request(app).post("/register").send(mockBuilding);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(mockBuilding.id);
      expect(res.body.name).toBe(mockBuilding.name);
      expect(res.body.rooms).toHaveLength(1);

      const inDb = await Building.findOne({ id: mockBuilding.id });
      expect(inDb).toBeTruthy();
      expect(inDb?.name).toBe(mockBuilding.name);
    });

    it("should fallback building name to id when omitted", async () => {
      const { name: _ignored, ...payloadWithoutName } = mockBuilding;

      const res = await request(app).post("/register").send(payloadWithoutName);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(payloadWithoutName.id);

      const inDb = await Building.findOne({ id: payloadWithoutName.id });
      expect(inDb?.name).toBe(payloadWithoutName.id);
    });

    it("should fail if building already exists", async () => {
      await new Building(mockBuilding).save();

      const res = await request(app).post("/register").send(mockBuilding);

      expect(res.status).toBe(409);
      expect(res.body.type).toBeDefined();
    });
  });

  describe("GET /building/:id", () => {
    it("should retrieve a building by ID", async () => {
      await new Building(mockBuilding).save();

      const res = await request(app).get(`/building/${mockBuilding.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(mockBuilding.id);
    });

    it("should return 404 if building not found", async () => {
      const res = await request(app).get("/building/NON_EXISTENT");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /buildings/:domain", () => {
    it("should retrieve buildings for a specific domain", async () => {
      await new Building(mockBuilding).save();
      await new Building({ ...mockBuilding, id: "Buildings-2" }).save();

      const res = await request(app).get(
        `/buildings/${mockBuilding.domains[0]}`,
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it("should return an empty list if no buildings found for domain", async () => {
      const res = await request(app).get("/buildings/unknown-domain");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("PATCH /building/:buildingId/room/:roomId", () => {
    beforeEach(async () => {
      await new Building(mockBuilding).save();
    });

    it("should update room details (capacity, color and name)", async () => {
      const updates = {
        capacity: 50,
        color: "#ff0000",
        name: "Physics Lab",
      };

      const res = await request(app)
        .patch(`/building/${mockBuilding.id}/room/Room-101`)
        .send(updates);

      expect(res.status).toBe(200);
      expect(res.body.capacity).toBe(50);
      expect(res.body.color).toBe("#ff0000");
      expect(res.body.name).toBe("Physics Lab");

      const updatedBuilding = await Building.findOne({ id: mockBuilding.id });
      const room = updatedBuilding?.rooms.find((r) => r.id === "Room-101");
      expect(room?.capacity).toBe(50);
      expect(room?.name).toBe("Physics Lab");
    });

    it("should return 404 if building not found", async () => {
      const res = await request(app)
        .patch("/building/FAKE_BUILDING/room/Room-101")
        .send({ capacity: 50 });

      expect(res.status).toBe(404);
    });

    it("should return 400 if room not found", async () => {
      const res = await request(app)
        .patch(`/building/${mockBuilding.id}/room/FAKE_ROOM`)
        .send({ capacity: 50 });

      expect(res.status).toBe(404);
      expect(res.body.type).toBeDefined();
      expect(res.body.message.toLowerCase()).toContain("room");
    });
  });

  describe("PATCH /building/:buildingId", () => {
    it("updates building details", async () => {
      await new Building(mockBuilding).save();

      const res = await request(app)
        .patch(`/building/${mockBuilding.id}`)
        .send({ name: "New Building Name" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New Building Name");

      const inDb = await Building.findOne({ id: mockBuilding.id });
      expect(inDb?.name).toBe("New Building Name");
    });
  });
});

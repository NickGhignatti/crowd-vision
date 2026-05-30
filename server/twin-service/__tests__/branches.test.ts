import { jest } from "@jest/globals";

import { Building } from "../src/models/building.js";
import {
  getBuildingsByDomain,
  getBuildingById,
  getDomainsByBuilding,
  addBuilding,
  updateBuilding,
  updateRoom,
} from "../src/services/buildings.js";

describe("Twin service branches", () => {
  const baseRoom = {
    id: "Room-101",
    name: "   ",
    capacity: 20,
    temperature: 22,
    no_person: 0,
    position: { x: 0, y: 0, z: 0 },
    dimensions: { width: 10, height: 10, depth: 10 },
    color: "#ffffff",
  };

  const baseBuilding = {
    id: "Buildings-Test-001",
    name: "   ",
    domains: ["test-domain"],
    rooms: [baseRoom],
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    await Building.deleteMany({});
  });

  it("normalizes blank names on registration and skips sensor sync in test mode", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      text: async () => "",
    } as any);

    const building = await addBuilding(
      baseBuilding.name,
      baseBuilding.rooms,
      baseBuilding.domains,
    );

    expect(building.name).toBe("Building");
    expect(building.id).toBeTruthy();
    expect(building.rooms[0]).toBeDefined();
    expect(building.rooms[0]?.name).toBe(baseRoom.id);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("backfills blank names when a building is loaded", async () => {
    await new Building(baseBuilding).save();

    const fetched = await getBuildingById(baseBuilding.id);

    expect(fetched.name).toBe(baseBuilding.id);
    expect(fetched.rooms[0]).toBeDefined();
    expect(fetched.rooms[0]?.name).toBe(baseRoom.id);

    const inDb = await Building.findOne({ id: baseBuilding.id });
    expect(inDb?.name).toBe(baseBuilding.id);
    expect(inDb?.rooms[0]).toBeDefined();
    expect(inDb?.rooms[0]?.name).toBe(baseRoom.id);
  });

  it("returns an empty list for unknown domains", async () => {
    const buildings = await getBuildingsByDomain("missing-domain");

    expect(buildings).toEqual([]);
  });

  it("returns the domains for a matching building name", async () => {
    const namedBuilding = {
      ...baseBuilding,
      name: "Engineering Block",
    };

    await new Building(namedBuilding).save();

    const domains = await getDomainsByBuilding(namedBuilding.name);

    expect(domains).toEqual(namedBuilding.domains);
  });

  it("rejects updates for unknown buildings", async () => {
    await expect(
      updateBuilding("missing-building", { name: "New name" }),
    ).rejects.toMatchObject({
      type: "Not Found Error",
      code: 404,
    });
  });

  it("rejects room updates when the room does not exist", async () => {
    await new Building(baseBuilding).save();

    await expect(
      updateRoom(baseBuilding.id, "missing-room", {
        capacity: 50,
      }),
    ).rejects.toMatchObject({
      type: "Not Found Error",
      code: 404,
      message: `Room with id "missing-room" in the building "${baseBuilding.id}" not found`,
    });
  });
});

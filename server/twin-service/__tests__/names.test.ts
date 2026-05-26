import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  normalizeBuildingName,
  normalizeRoomNames,
  backfillNames,
} from "../src/services/names.js";

/**
 * Tests for the pure name-normalization helpers in names.ts.
 *
 * The invariant for all three functions:
 *   – A valid, non-blank name is preserved (and trimmed).
 *   – An absent, empty, or whitespace-only name falls back to the entity's ID.
 */

// ── normalizeBuildingName ────────────────────────────────────────────────────

describe("normalizeBuildingName", () => {
  it("returns the id when name is undefined", () => {
    expect(normalizeBuildingName(undefined, "bldg-001")).toBe("bldg-001");
  });

  it("returns the id when name is an empty string", () => {
    expect(normalizeBuildingName("", "bldg-001")).toBe("bldg-001");
  });

  it("returns the id when name is whitespace only", () => {
    expect(normalizeBuildingName("   ", "bldg-001")).toBe("bldg-001");
  });

  it("returns the trimmed name when it is a valid string", () => {
    expect(normalizeBuildingName("Science Block", "bldg-001")).toBe(
      "Science Block",
    );
  });

  it("trims surrounding whitespace from a valid name", () => {
    expect(normalizeBuildingName("  Science Block  ", "bldg-001")).toBe(
      "Science Block",
    );
  });

  it("preserves a name that is already trimmed", () => {
    expect(normalizeBuildingName("A", "bldg-001")).toBe("A");
  });
});

// ── normalizeRoomNames ───────────────────────────────────────────────────────

describe("normalizeRoomNames", () => {
  const baseRoom = (overrides: Partial<{ name: string; id: string }>) => ({
    id: "room-1",
    name: "Room 1",
    capacity: 30,
    ...overrides,
  });

  it("returns an empty array unchanged", () => {
    expect(normalizeRoomNames([])).toEqual([]);
  });

  it("falls back to room id when room name is empty", () => {
    const rooms = [baseRoom({ name: "", id: "room-1" })] as any;
    const result = normalizeRoomNames(rooms);
    expect(result[0].name).toBe("room-1");
  });

  it("falls back to room id when room name is whitespace only", () => {
    const rooms = [baseRoom({ name: "  ", id: "room-1" })] as any;
    const result = normalizeRoomNames(rooms);
    expect(result[0].name).toBe("room-1");
  });

  it("trims a valid room name", () => {
    const rooms = [baseRoom({ name: "  Lab A  ", id: "room-1" })] as any;
    const result = normalizeRoomNames(rooms);
    expect(result[0].name).toBe("Lab A");
  });

  it("preserves a valid room name unchanged", () => {
    const rooms = [baseRoom({ name: "Lab A", id: "room-1" })] as any;
    const result = normalizeRoomNames(rooms);
    expect(result[0].name).toBe("Lab A");
  });

  it("preserves all other room fields", () => {
    const rooms = [baseRoom({ name: "Lab", id: "room-1" })] as any;
    const result = normalizeRoomNames(rooms);
    expect(result[0].id).toBe("room-1");
    expect(result[0].capacity).toBe(30);
  });

  it("processes every room in the array independently", () => {
    const rooms = [
      baseRoom({ name: "OK", id: "r1" }),
      baseRoom({ name: "", id: "r2" }),
      baseRoom({ name: "  ", id: "r3" }),
    ] as any;
    const result = normalizeRoomNames(rooms);
    expect(result[0].name).toBe("OK");
    expect(result[1].name).toBe("r2");
    expect(result[2].name).toBe("r3");
  });
});

// ── backfillNames ────────────────────────────────────────────────────────────

describe("backfillNames", () => {
  const makeMockBuilding = (opts: {
    id: string;
    name: string;
    rooms?: Array<{ id: string; name: string }>;
  }) => ({
    id: opts.id,
    name: opts.name,
    rooms: (opts.rooms ?? []) as any[],
    save: jest.fn().mockResolvedValue(undefined as never),
  });

  it("sets building name to id and saves when building name is empty", async () => {
    const building = makeMockBuilding({ id: "bldg-1", name: "" }) as any;
    await backfillNames(building);

    expect(building.name).toBe("bldg-1");
    expect(building.save).toHaveBeenCalledTimes(1);
  });

  it("sets building name to id when name is whitespace only", async () => {
    const building = makeMockBuilding({ id: "bldg-1", name: "   " }) as any;
    await backfillNames(building);

    expect(building.name).toBe("bldg-1");
  });

  it("does not change a valid building name", async () => {
    const building = makeMockBuilding({
      id: "bldg-1",
      name: "Main Hall",
    }) as any;
    await backfillNames(building);

    expect(building.name).toBe("Main Hall");
  });

  it("does not call save when nothing needs updating", async () => {
    const building = makeMockBuilding({
      id: "bldg-1",
      name: "Main Hall",
      rooms: [{ id: "r1", name: "Room 1" }],
    }) as any;
    await backfillNames(building);

    expect(building.save).not.toHaveBeenCalled();
  });

  it("fills back empty room names to their ids", async () => {
    const building = makeMockBuilding({
      id: "bldg-1",
      name: "Main Hall",
      rooms: [{ id: "r1", name: "" }],
    }) as any;
    await backfillNames(building);

    expect(building.rooms[0].name).toBe("r1");
    expect(building.save).toHaveBeenCalledTimes(1);
  });

  it("fills back whitespace-only room names to their ids", async () => {
    const building = makeMockBuilding({
      id: "bldg-1",
      name: "Main Hall",
      rooms: [{ id: "r1", name: "  " }],
    }) as any;
    await backfillNames(building);

    expect(building.rooms[0].name).toBe("r1");
  });

  it("saves exactly once even when both building and multiple rooms need backfilling", async () => {
    const building = makeMockBuilding({
      id: "bldg-1",
      name: "",
      rooms: [
        { id: "r1", name: "" },
        { id: "r2", name: "" },
      ],
    }) as any;
    await backfillNames(building);

    expect(building.name).toBe("bldg-1");
    expect(building.rooms[0].name).toBe("r1");
    expect(building.rooms[1].name).toBe("r2");
    expect(building.save).toHaveBeenCalledTimes(1);
  });
});

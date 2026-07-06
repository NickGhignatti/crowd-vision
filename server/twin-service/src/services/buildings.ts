import { randomUUID } from "crypto";
import { Building, type IBuilding, type Room } from "../models/building.js";
import { NotFoundError, ValidationError } from "../models/error.js";
import { syncBuildingClone, initRoomThresholds } from "./sensors.js";
import { initBuildingPreferences } from "./contractsService.js";
import {
  backfillNames,
  normalizeBuildingName,
  normalizeRoomNames,
} from "./names.js";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

// Shared by updateRoom/createRoom/replaceRooms so every write path enforces the
// same geometry invariants (position = center, positive box extents) — see
// MODEL_EDITOR_PLAN.md §0.3.
const assertValidPosition = (position: unknown): void => {
  const p = position as Partial<Room["position"]> | undefined;
  if (
    !p ||
    !isFiniteNumber(p.x) ||
    !isFiniteNumber(p.y) ||
    !isFiniteNumber(p.z)
  ) {
    throw new ValidationError(
      "position.x, position.y and position.z must be finite numbers",
    );
  }
};

const assertValidDimensions = (dimensions: unknown): void => {
  const d = dimensions as Partial<Room["dimensions"]> | undefined;
  const values = [d?.width, d?.height, d?.depth];
  if (!values.every((v) => isFiniteNumber(v) && v > 0)) {
    throw new ValidationError(
      "dimensions.width, dimensions.height and dimensions.depth must be positive numbers",
    );
  }
};

export const addBuilding = async (
  name: string | undefined,
  rooms: any,
  domains: string[],
  authToken?: string,
) => {
  const normalizedBuildingName = normalizeBuildingName(name, undefined);
  const normalizedRooms = normalizeRoomNames(rooms as Room[]);
  const building = new Building({
    name: normalizedBuildingName,
    rooms: normalizedRooms,
    domains,
  });
  await building.save();
  await syncBuildingClone(building.toObject(), undefined, authToken);
  await initBuildingPreferences(building.id);
  return building;
};

export const updateBuilding = async (
  buildingId: string,
  updates: Partial<Pick<IBuilding, "name" | "domains">> & {
    maxTemperature?: number;
  },
  authToken?: string,
) => {
  const building = await getBuildingById(buildingId);

  if (updates.name !== undefined) {
    building.name = updates.name;
  }

  if (updates.domains !== undefined) {
    building.domains = updates.domains;
  }

  await building.save();

  await syncBuildingClone(
    building.toObject(),
    updates.maxTemperature,
    authToken,
  );

  return building;
};

export const getBuildingById = async (id: string) => {
  // $eq blocks NoSQL operator injection (applied to all user-derived filters).
  const building = await Building.findOne({ id: { $eq: id } });

  if (!building) {
    throw new NotFoundError(`Building with id: "${id}" not found`);
  }

  await backfillNames(building);
  return building;
};

export const getBuildingsByDomain = async (domain: string) => {
  const buildings = await Building.find({ domains: { $eq: domain } });

  if (buildings.length === 0) {
    return [];
  }

  await Promise.all(buildings.map((building) => backfillNames(building)));
  return buildings;
};

export const updateRoom = async (
  buildingId: string,
  roomId: string,
  updates: Partial<Pick<Room, "name" | "color" | "capacity" | "position" | "dimensions">>,
  authToken?: string,
) => {
  const building = await getBuildingById(buildingId);

  const room = building.rooms.find((r) => r.id === roomId);
  if (!room) {
    throw new NotFoundError(
      `Room with id "${roomId}" in the building "${buildingId}" not found`,
    );
  }

  if (updates.position !== undefined) assertValidPosition(updates.position);
  if (updates.dimensions !== undefined) assertValidDimensions(updates.dimensions);

  if (updates.name !== undefined) room.name = updates.name;
  if (updates.color !== undefined) room.color = updates.color;
  if (updates.capacity !== undefined) room.capacity = updates.capacity;
  if (updates.position !== undefined) room.position = updates.position;
  if (updates.dimensions !== undefined) room.dimensions = updates.dimensions;

  await building.save();
  await syncBuildingClone(building.toObject(), undefined, authToken);
  return room;
};

export const createRoom = async (
  buildingId: string,
  input: {
    name?: string;
    capacity?: number;
    position: unknown;
    dimensions: unknown;
    color?: string;
  },
  authToken?: string,
) => {
  const building = await getBuildingById(buildingId);

  assertValidPosition(input.position);
  assertValidDimensions(input.dimensions);
  if (!isFiniteNumber(input.capacity) || input.capacity < 0) {
    throw new ValidationError("capacity must be a non-negative number");
  }

  const id = randomUUID();
  const room: Room = {
    id,
    name: input.name?.trim() || id,
    capacity: input.capacity,
    position: input.position as Room["position"],
    dimensions: input.dimensions as Room["dimensions"],
    ...(input.color !== undefined && { color: input.color }),
  };

  building.rooms.push(room);
  await building.save();
  await syncBuildingClone(building.toObject(), undefined, authToken);
  await initRoomThresholds(buildingId, room, authToken);
  return room;
};

export const deleteRoom = async (
  buildingId: string,
  roomId: string,
  authToken?: string,
) => {
  const building = await getBuildingById(buildingId);

  const room = building.rooms.find((r) => r.id === roomId);
  if (!room) {
    throw new NotFoundError(
      `Room with id "${roomId}" in the building "${buildingId}" not found`,
    );
  }

  if (building.rooms.length === 1) {
    throw new ValidationError("Cannot delete the last room in a building");
  }

  building.rooms = building.rooms.filter((r) => r.id !== roomId);
  await building.save();
  await syncBuildingClone(building.toObject(), undefined, authToken);
};

// Atomic bulk replace — the editor's primary Save path (move/resize/add/delete/
// merge all collapse into one full-array diff). Validates every room before
// writing any of them so a bad room never produces a partial write.
export const replaceRooms = async (
  buildingId: string,
  rooms: any[],
  authToken?: string,
) => {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new ValidationError("'rooms' must be a non-empty array");
  }

  const seenIds = new Set<string>();
  const normalized: Room[] = rooms.map((raw) => {
    if (!raw || typeof raw.id !== "string" || raw.id.trim() === "") {
      throw new ValidationError("Every room must have a non-empty 'id'");
    }
    if (seenIds.has(raw.id)) {
      throw new ValidationError(`Duplicate room id "${raw.id}"`);
    }
    seenIds.add(raw.id);

    assertValidPosition(raw.position);
    assertValidDimensions(raw.dimensions);
    if (!isFiniteNumber(raw.capacity) || raw.capacity < 0) {
      throw new ValidationError(
        `Room "${raw.id}": capacity must be a non-negative number`,
      );
    }

    return {
      id: raw.id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : raw.id,
      capacity: raw.capacity,
      position: raw.position,
      dimensions: raw.dimensions,
      color: raw.color,
    };
  });

  const building = await getBuildingById(buildingId);
  const previousIds = new Set(building.rooms.map((r) => r.id));
  const addedRooms = normalized.filter((r) => !previousIds.has(r.id));

  building.rooms = normalized;
  await building.save();
  await syncBuildingClone(building.toObject(), undefined, authToken);

  // Best-effort: a dead sensor-threshold row for a removed room is harmless, so
  // only newly-added rooms need reconciliation, and a failure here must never
  // undo the geometry save.
  await Promise.all(
    addedRooms.map((room) => initRoomThresholds(buildingId, room, authToken)),
  );

  return building;
};

// Counts buildings per domain, restricted to the explicit names supplied by the
// caller so this route can't be used to enumerate every domain in the system.
export const getBuildingCountsFor = async (domainNames: string[]) => {
  if (domainNames.length === 0) return {} as Record<string, number>;

  const rows = await Building.aggregate([
    { $unwind: "$domains" },
    { $match: { domains: { $in: domainNames } } },
    { $group: { _id: "$domains", count: { $sum: 1 } } },
  ]);

  return Object.fromEntries(
    rows.map((r) => [r._id as string, r.count as number]),
  );
};

export const getDomainsByBuilding = async (buildingName: string) => {
  const buildings = await Building.find({ name: { $eq: buildingName } });
  return buildings.flatMap((building) => building.domains);
};

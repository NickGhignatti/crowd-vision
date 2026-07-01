import { Building, type IBuilding, type Room } from "../models/building.js";
import { ConflictError, NotFoundError } from "../models/error.js";
import { syncBuildingClone } from "./sensors.js";
import { initBuildingPreferences } from "./contractsService.js";
import {
  backfillNames,
  normalizeBuildingName,
  normalizeRoomNames,
} from "./names.js";

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
  updates: Partial<Pick<Room, "name" | "color" | "capacity">>,
  authToken?: string,
) => {
  const building = await getBuildingById(buildingId);

  const room = building.rooms.find((r) => r.id === roomId);
  if (!room) {
    throw new NotFoundError(
      `Room with id "${roomId}" in the building "${buildingId}" not found`,
    );
  }

  if (updates.name !== undefined) room.name = updates.name;
  if (updates.color !== undefined) room.color = updates.color;
  if (updates.capacity !== undefined) room.capacity = updates.capacity;

  await building.save();
  await syncBuildingClone(building.toObject(), undefined, authToken);
  return room;
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

import { Building, type IBuilding, type Room } from "../models/building.js";
import {ConflictError, NotFoundError} from "../models/error.js";
import { syncBuildingClone } from "./sensors.js";
import {
  backfillNames,
  normalizeBuildingName,
  normalizeRoomNames,
} from "./names.js";

export const addBuilding = async (
  id: string,
  name: string | undefined,
  rooms: any,
  domains: string[],
) => {
    if (await Building.findOne({ id })) {
        throw new ConflictError(`Building with id: "${id}" already exists`);
    }

    const normalizedBuildingName = normalizeBuildingName(name, id);
    const normalizedRooms = normalizeRoomNames(rooms as Room[]);
    const building = new Building({
      id,
      name: normalizedBuildingName,
      rooms: normalizedRooms,
      domains,
    });
    await building.save();
    await syncBuildingClone(building.toObject());
    return building;
};

export const updateBuilding = async (
  buildingId: string,
  updates: Partial<Pick<IBuilding, "name" | "domains">> & {
    maxTemperature?: number;
  },
) => {
  const building = await getBuildingById(buildingId);

  if (updates.name !== undefined) {
    building.name = updates.name;
  }

  if (updates.domains !== undefined) {
    building.domains = updates.domains;
  }

  await building.save();

  await syncBuildingClone(building.toObject(), updates.maxTemperature);

  return building;
};

export const getBuildingById = async (id: string) => {
    const building = await Building.findOne({ id });

    if (!building) {
        throw new NotFoundError(`Building with id: "${id}" not found`);
    }

    await backfillNames(building);
    return building;
};

export const getBuildingsByDomain = async (domain: string) => {
    const buildings = await Building.find({ domains: domain });

    if (buildings.length === 0) {
        return [];
    }

    await Promise.all(buildings.map((building) => backfillNames(building)));
    return buildings;
};

export const updateRoom = async (
  buildingId: string,
  roomId: string,
  updates: Partial<Room>,
) => {
  const building = await getBuildingById(buildingId);

  const room = building.rooms.find((r) => r.id === roomId);
  if (!room) {
    throw new NotFoundError(
      `Room with id "${roomId}" in the building "${buildingId}" not found`,
    );
  }

  if (updates.id !== undefined) room.id = updates.id;
  if (updates.name !== undefined) room.name = updates.name;
  if (updates.color !== undefined) room.color = updates.color;
  if (updates.capacity !== undefined) room.capacity = updates.capacity;

  await building.save();
  await syncBuildingClone(building.toObject());
  return room;
};

export const getDomainsByBuilding = async (buildingName: string) => {
  const buildings = await Building.find({ name: buildingName });
  return buildings.flatMap((building) => building.domains);
};
import { Building, type IBuilding, type Room } from "../models/twin.js";
import {ConflictError, NotFoundError} from "../models/error.js";
import type {HydratedDocument} from "mongoose";

const getSensorServiceUrl = () =>
  process.env.SENSOR_SERVICE_URL || process.env.VITE_SERVER_URL || 'http://localhost:3000';

const shouldSyncThresholds = () => process.env.NODE_ENV !== 'test';

const syncThresholdClone = async (path: string, init: RequestInit) => {
  if (!shouldSyncThresholds()) return;

  const response = await fetch(`${getSensorServiceUrl()}${path}`, init);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Failed to sync sensor threshold clone: ${response.status} ${details}`,
    );
  }
};

const buildThresholdClonePayload = (
  building: Pick<IBuilding, "id" | "name" | "rooms">,
  maxTemperature?: number,
) => ({
  name: building.name,
  ...(maxTemperature !== undefined && { maxTemperature }), // Add it to payload if provided
  rooms: building.rooms.map((room) => ({
    id: room.id,
    name: room.name?.trim() || room.id,
  })),
});

const syncBuildingClone = async (
  building: Pick<IBuilding, "id" | "name" | "rooms">,
  maxTemperature?: number,
) => {
  await syncThresholdClone(
    `/thresholds/buildings/${encodeURIComponent(building.id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildThresholdClonePayload(building, maxTemperature),
      ),
    },
  );
};

const normalizeBuildingName = (name: string | undefined, id: string): string => {
    return name?.trim() || id;
};

const normalizeRoomNames = (rooms: Room[]): Room[] => {
    return rooms.map((room) => ({
        ...room,
        name: room.name?.trim() || room.id,
    }));
};

const backfillNames = async (building: HydratedDocument<IBuilding>) => {
    let changed = false;

    if (!building.name || !building.name.trim()) {
        building.name = building.id;
        changed = true;
    }

    for (const room of building.rooms) {
        if (!room.name || !room.name.trim()) {
            room.name = room.id;
            changed = true;
        }
    }

    if (changed) {
        await building.save();
    }
};


export const registerBuilding = async (
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

export const updateRoomInBuilding = async (
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
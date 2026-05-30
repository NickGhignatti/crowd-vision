import { type IBuilding, type Room } from "../models/building.js";
import type { HydratedDocument } from "mongoose";

export const normalizeBuildingName = (
  name: string | undefined,
  id: string | undefined,
): string => {
  return name?.trim() || id || "Building";
};

export const normalizeRoomNames = (rooms: Room[]): Room[] => {
  return rooms.map((room) => ({
    ...room,
    name: room.name?.trim() || room.id,
  }));
};

export const backfillNames = async (building: HydratedDocument<IBuilding>) => {
  let changed = false;

  const normalizedBuildingName = normalizeBuildingName(building.name, building.id);
  if (normalizedBuildingName !== building.name) {
    building.name = normalizedBuildingName;
    changed = true;
  }

  for (const room of building.rooms) {
    const normalizedRoomName = room.name?.trim() || room.id;
    if (normalizedRoomName !== room.name) {
      room.name = normalizedRoomName;
      changed = true;
    }
  }

  if (changed) {
    await building.save();
  }
};

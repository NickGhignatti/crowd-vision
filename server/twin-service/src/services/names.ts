import { type IBuilding, type Room } from "../models/building.js";
import type { HydratedDocument } from "mongoose";

export const normalizeBuildingName = (
  name: string | undefined,
  id: string,
): string => {
  return name?.trim() || id;
};

export const normalizeRoomNames = (rooms: Room[]): Room[] => {
  return rooms.map((room) => ({
    ...room,
    name: room.name?.trim() || room.id,
  }));
};

export const backfillNames = async (building: HydratedDocument<IBuilding>) => {
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

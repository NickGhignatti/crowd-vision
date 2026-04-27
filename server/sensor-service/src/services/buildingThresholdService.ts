import { BuildingThresholdModel, type ThresholdRoom } from '../models/buildingThreshold.js';

const DEFAULT_MAX_TEMPERATURE = 27;

export type BuildingThresholdInput = {
  buildingId: string;
  maxTemperature?: number;
  rooms?: Array<Partial<ThresholdRoom> & { id: string }>;
};

export const syncBuildingThreshold = async (payload: BuildingThresholdInput) => {
  const existing = await BuildingThresholdModel.findOne({ buildingId: payload.buildingId }).lean();
  const buildingMaxTemperature =
    typeof payload.maxTemperature === 'number'
      ? payload.maxTemperature
      : typeof existing?.maxTemperature === 'number'
        ? existing.maxTemperature
        : DEFAULT_MAX_TEMPERATURE;

  const existingRoomsById = new Map((existing?.rooms ?? []).map((room) => [room.id, room]));
  const rooms = (payload.rooms ?? []).map((room) => {
    const existingRoom = existingRoomsById.get(room.id);
    return {
      id: room.id,
      maxTemperature:
        typeof room.maxTemperature === 'number'
          ? room.maxTemperature
          : typeof existingRoom?.maxTemperature === 'number'
            ? existingRoom.maxTemperature
            : buildingMaxTemperature,
    };
  });

  return BuildingThresholdModel.findOneAndUpdate(
    { buildingId: payload.buildingId },
    {
      buildingId: payload.buildingId,
      maxTemperature: buildingMaxTemperature,
      rooms,
    },
    { upsert: true, returnDocument: 'after' },
  ).lean();
};

export const updateBuildingThreshold = async (
  buildingId: string,
  updates: { maxTemperature?: number },
) => {
  const building = await BuildingThresholdModel.findOne({ buildingId });
  if (!building) return null;

  if (typeof updates.maxTemperature === 'number') {
    const previousMaxTemperature = building.maxTemperature ?? DEFAULT_MAX_TEMPERATURE;
    building.maxTemperature = updates.maxTemperature;

    for (const room of building.rooms) {
      if (room.maxTemperature === previousMaxTemperature) {
        room.maxTemperature = updates.maxTemperature;
      }
    }
  }

  await building.save();
  return building.toObject();
};

export const updateRoomThreshold = async (
  buildingId: string,
  roomId: string,
  updates: { maxTemperature?: number },
) => {
  const building = await BuildingThresholdModel.findOne({ buildingId });
  if (!building) return null;

  const room = building.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return null;

  if (typeof updates.maxTemperature === 'number') room.maxTemperature = updates.maxTemperature;

  await building.save();
  return building.toObject();
};

export const resolveThreshold = async (buildingId: string, roomId: string) => {
  const building = await BuildingThresholdModel.findOne({ buildingId }).lean();

  if (!building) return DEFAULT_MAX_TEMPERATURE;

  const room = building.rooms?.find((candidate) => candidate.id === roomId);
  if (room && typeof room.maxTemperature === 'number') {
    return room.maxTemperature;
  }

  return typeof building.maxTemperature === 'number'
    ? building.maxTemperature
    : DEFAULT_MAX_TEMPERATURE;
};

export const getBuildingThreshold = async (buildingId: string) => {
  return BuildingThresholdModel.findOne({ buildingId }).lean();
};


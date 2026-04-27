import type { Request, Response } from 'express';
import {
  type BuildingThresholdInput,
  getBuildingThreshold as getBuildingThresholdClone,
  syncBuildingThreshold,
  updateBuildingThreshold,
  updateRoomThreshold,
} from "../services/buildingThresholdService.js";

export const syncBuilding = async (req: Request, res: Response) => {
  const { buildingId } = req.params;
  const { name, maxTemperature, rooms } = req.body as {
    name?: string;
    maxTemperature?: number;
    rooms?: Array<{ id: string; name?: string; maxTemperature?: number }>;
  };

  if (!buildingId || !name) {
    return res.status(400).json({ error: 'buildingId and name are required' });
  }

  const building = await syncBuildingThreshold({
    buildingId,
    name,
    maxTemperature,
    rooms,
  } as BuildingThresholdInput);
  return res.status(200).json(building);
};

export const patchBuildingThreshold = async (req: Request, res: Response) => {
  const { buildingId } = req.params;
  const { name, maxTemperature } = req.body as { name?: string; maxTemperature?: number };

  const building = await updateBuildingThreshold(buildingId as string, { name: name as string, maxTemperature: maxTemperature as number });
  if (!building) return res.status(404).json({ error: 'Building threshold not found' });

  return res.status(200).json(building);
};

export const patchRoomThreshold = async (req: Request, res: Response) => {
  const { buildingId, roomId } = req.params;
  const { name, maxTemperature } = req.body as { name?: string; maxTemperature?: number };

  const building = await updateRoomThreshold(
    buildingId as string,
    roomId as string,
    { name: name as string, maxTemperature: maxTemperature as number },
  );
  if (!building) return res.status(404).json({ error: 'Room threshold not found' });

  return res.status(200).json(building);
};

export const getBuildingThreshold = async (req: Request, res: Response) => {
  const { buildingId } = req.params;
  const threshold = await getBuildingThresholdClone(buildingId as string);
  return res.status(200).json(threshold ?? { buildingId, rooms: [] });
};



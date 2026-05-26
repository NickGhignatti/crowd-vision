import type { Request, Response } from "express";
import * as BuildingService from "../services/buildings.js";

export const addBuilding = async (req: Request, res: Response) => {
  const { id, name, rooms, domains } = req.body;
  const building = await BuildingService.addBuilding(id, name, rooms, domains);
  res.status(201).json(building);
};

export const getBuildingById = async (req: Request, res: Response) => {
  const id = req.params.id;
  const building = await BuildingService.getBuildingById(id as string);
  res.status(200).json(building);
};

export const getBuildingByDomain = async (req: Request, res: Response) => {
  const domain = req.params.domain;
  const buildings = await BuildingService.getBuildingsByDomain(
    domain as string,
  );
  res.status(200).json(buildings);
};

export const updateRoom = async (req: Request, res: Response) => {
  const { buildingId, roomId } = req.params;
  const updates = req.body;
  const updatedRoom = await BuildingService.updateRoom(
    buildingId as string,
    roomId as string,
    updates,
  );
  res.status(200).json(updatedRoom);
};

export const updateBuilding = async (req: Request, res: Response) => {
  const { buildingId } = req.params;
  const updates = req.body;
  const updatedBuilding = await BuildingService.updateBuilding(
    buildingId as string,
    updates,
  );
  res.status(200).json(updatedBuilding);
};

export const getDomainsByBuilding = async (req: Request, res: Response) => {
  const buildingName = req.params.buildingName as string;
  res
    .status(200)
    .json(await BuildingService.getDomainsByBuilding(buildingName));
};

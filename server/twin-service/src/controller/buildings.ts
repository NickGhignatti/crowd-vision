import type { Request, Response } from "express";
import * as BuildingService from "../services/buildings.js";
import { ValidationError } from "../models/error.js";

const MAX_DOMAIN_NAMES = 500;

export const addBuilding = async (req: Request, res: Response) => {
  const { name, rooms, domains } = req.body;
  const building = await BuildingService.addBuilding(
    name,
    rooms,
    domains,
    req.authToken,
  );
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
    req.authToken,
  );
  res.status(200).json(updatedRoom);
};

export const updateBuilding = async (req: Request, res: Response) => {
  const { buildingId } = req.params;
  const updates = req.body;
  const updatedBuilding = await BuildingService.updateBuilding(
    buildingId as string,
    updates,
    req.authToken,
  );
  res.status(200).json(updatedBuilding);
};

export const getBuildingCounts = async (req: Request, res: Response) => {
  const { domains } = req.body;

  if (
    !Array.isArray(domains) ||
    !domains.every((d) => typeof d === "string")
  ) {
    throw new ValidationError("'domains' must be an array of strings");
  }

  if (domains.length > MAX_DOMAIN_NAMES) {
    throw new ValidationError(
      `Too many domains requested (max ${MAX_DOMAIN_NAMES})`,
    );
  }

  const counts = await BuildingService.getBuildingCountsFor(domains);
  res.status(200).json({ counts });
};

export const getDomainsByBuilding = async (req: Request, res: Response) => {
  const buildingName = req.params.buildingName as string;
  res
    .status(200)
    .json(await BuildingService.getDomainsByBuilding(buildingName));
};

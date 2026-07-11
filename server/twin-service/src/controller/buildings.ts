import type { Request, Response } from "express";
import * as BuildingService from "../services/buildings.js";
import { ForbiddenError, ValidationError } from "../models/error.js";
import {
  canEditDomains,
  isMemberOf,
  scopeToMemberships,
} from "../services/cedarAuthz.js";

const MAX_DOMAIN_NAMES = 500;

// Shared by every geometry-mutating route: confirms the caller holds an
// editing role in one of the target building's own domains, not just any
// domain membership (see MODEL_EDITOR_PLAN.md §3).
const assertCanEditBuilding = async (req: Request, buildingId: string) => {
  const building = await BuildingService.getBuildingById(buildingId);
  if (!canEditDomains(req.account, building.domains)) {
    throw new ForbiddenError(
      "Requires an editing role in one of this building's domains",
    );
  }
};

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
  const domain = req.params.domain as string;
  if (!isMemberOf(req.account, domain)) {
    throw new ForbiddenError("Not a member of this domain");
  }
  const buildings = await BuildingService.getBuildingsByDomain(domain);
  res.status(200).json(buildings);
};

export const updateRoom = async (req: Request, res: Response) => {
  const { buildingId, roomId } = req.params;
  const updates = req.body;
  await assertCanEditBuilding(req, buildingId as string);
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
  await assertCanEditBuilding(req, buildingId as string);
  const updatedBuilding = await BuildingService.updateBuilding(
    buildingId as string,
    updates,
    req.authToken,
  );
  res.status(200).json(updatedBuilding);
};

export const createRoom = async (req: Request, res: Response) => {
  const { buildingId } = req.params;
  await assertCanEditBuilding(req, buildingId as string);
  const room = await BuildingService.createRoom(
    buildingId as string,
    req.body,
    req.authToken,
  );
  res.status(201).json(room);
};

export const deleteRoom = async (req: Request, res: Response) => {
  const { buildingId, roomId } = req.params;
  await assertCanEditBuilding(req, buildingId as string);
  await BuildingService.deleteRoom(
    buildingId as string,
    roomId as string,
    req.authToken,
  );
  res.status(204).send();
};

export const replaceRooms = async (req: Request, res: Response) => {
  const { buildingId } = req.params;
  await assertCanEditBuilding(req, buildingId as string);
  const building = await BuildingService.replaceRooms(
    buildingId as string,
    req.body?.rooms,
    req.authToken,
  );
  res.status(200).json(building);
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

  const counts = await BuildingService.getBuildingCountsFor(
    scopeToMemberships(domains, req.account),
  );
  res.status(200).json({ counts });
};

export const getDomainsByBuilding = async (req: Request, res: Response) => {
  const buildingName = req.params.buildingName as string;
  res
    .status(200)
    .json(await BuildingService.getDomainsByBuilding(buildingName));
};

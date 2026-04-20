import type {Request, Response} from 'express';
import {
    getBuildingById,
    getBuildingsByDomain,
    registerBuilding,
    updateRoomInBuilding
} from "../services/twinService.js";

export const register = async (req: Request, res: Response) => {
    const { id, name, rooms, domains } = req.body;
    const building = await registerBuilding(id, name, rooms, domains);
    res.status(201).json(building);
};

export const getById = async (req: Request, res: Response) => {
    const id = req.params.id;
    const building = await getBuildingById(id as string);
    res.status(200).json(building);
};

export const getByDomain = async (req: Request, res: Response) => {
    const domain = req.params.domain;
    const buildings = await getBuildingsByDomain(domain as string);
    res.status(200).json(buildings);
};

export const updateRoom = async (req: Request, res: Response) => {
    const { buildingId, roomId } = req.params;
    const updates = req.body;
    const updatedRoom = await updateRoomInBuilding(buildingId as string, roomId as string, updates);
    res.status(200).json(updatedRoom);
}
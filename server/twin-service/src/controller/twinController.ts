import type {Request, Response} from 'express';
import {
    getBuildingById,
    getBuildingsByDomain,
    registerBuilding,
    updateRoomInBuilding
} from "../services/twinService.js";

export const register = async (req: Request, res: Response) => {
    try {
        const { id, rooms, domains } = req.body;
        const building = await registerBuilding(id, rooms, domains);
        res.status(201).json(building);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getById = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const building = await getBuildingById(id as string);
        res.status(200).json(building);
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
};

export const getByDomain = async (req: Request, res: Response) => {
    try {
        const domain = req.params.domain;
        const buildings = await getBuildingsByDomain(domain as string);
        res.status(200).json(buildings);
    } catch (error: any) {
        res.status(404).json({ error: error.message });
    }
};

export const updateRoom = async (req: Request, res: Response) => {
    try {
        const { buildingId, roomId } = req.params;
        const updates = req.body;
        const updatedRoom = await updateRoomInBuilding(buildingId as string, roomId as string, updates);
        res.status(200).json(updatedRoom);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}
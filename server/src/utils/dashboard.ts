import type {Request, Response} from "express";
import {model} from "mongoose";
import {buildingSchema, IBuilding} from "../db/schema";

const Building = model<IBuilding>('Building', buildingSchema);

export async function uploadBuilding(req: Request, res: Response) {
    const { id, rooms, domains } = req.body;

    if (!await Building.findOne({ id })) {
        const building = new Building({ id, rooms, domains });
        await building.save();
        res.status(201).json({
            message: 'Building uploaded successfully.',
            building: {
                id: id,
                rooms: rooms,
                domains: domains,
            }
        });
    } else {
        res.status(400).json({
            message: 'Building already present.',
        })
    }
}

export async function getBuilding(req: Request, res: Response) {
    const id = req.params.id;
    const building = await Building.findOne({ id })

    if (building) {
        res.status(201).json({
            message: 'Building found successfully.',
            building: {
                id: building.id,
                rooms: building.rooms,
                domains: building.domains,
            }
        });
    } else {
        res.status(404).json({
            message: 'Building not found.',
        })
    }
}
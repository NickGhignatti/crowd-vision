import type {Request, Response} from "express";
import {model} from "mongoose";
import {buildingSchema, IBuilding} from "../db/schema";

const roomData = [
    { room: 'Main Hall', status: 'Free', teacher: 'Ghini', temp: '22°C', people: 145 },
    { room: 'East Wing', status: 'Free', teacher: 'Viroli', temp: '21°C', people: 12 },
    { room: 'Cafeteria', status: 'Busy', teacher: 'Ricci', temp: '24°C', people: 89 },
    { room: 'Lobby', status: 'Busy', teacher: 'Gallinucci', temp: '20°C', people: 34 },
];

export async function getAllRoomsData(req: Request, res: Response) {
    res.status(201).json({
        message: 'Rooms data',
        roomData: roomData
    });
}

const Building = model<IBuilding>('Building', buildingSchema);

export async function uploadBuilding(req: Request, res: Response) {
    const { id, rooms } = req.body;

    if (!await Building.findOne({ id })) {
        const building = new Building({ id, rooms });
        await building.save();
        res.status(201).json({
            message: 'Building uploaded successfully.',
            building: {
                id: id,
                rooms: rooms,
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
            }
        });
    } else {
        res.status(404).json({
            message: 'Building not found.',
        })
    }
}
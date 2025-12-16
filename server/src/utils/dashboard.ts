import type {Request, Response} from "express";

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
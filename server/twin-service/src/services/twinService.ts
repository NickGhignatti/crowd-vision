import {Building, type Room} from "../models/twin.js";
import {ConflictError, NotFoundError} from "../models/error.js";


export const registerBuilding = async (id: string, rooms: any, domains: string[]) => {
    if (await Building.findOne({ id })) {
        throw new ConflictError(`Building with id: "${id}" already exists`);
    }

    const building = new Building({ id, rooms, domains });
    await building.save();
    return building;
};

export const getBuildingById = async (id: string) => {
    const building = await Building.findOne({ id });

    if (!building) {
        throw new NotFoundError(`Building with id: "${id}" not found`);
    }
    return building;
};

export const getBuildingsByDomain = async (domain: string) => {
    const buildings = await Building.find({ domains: domain });

    if (buildings.length === 0) {
        throw new NotFoundError(`Building within the domain: "${domain}" not found`);
    }
    return buildings;
};

export const updateRoomInBuilding = async (buildingId: string, roomId: string, updates: Partial<Room>) => {
    const building = await getBuildingById(buildingId);

    const room = building.rooms.find(r => r.id === roomId);
    if (!room) {
        throw new NotFoundError(`Room with id "${roomId}" in the building "${buildingId}" not found`);
    }

    if (updates.id !== undefined) room.id = updates.id;
    if (updates.color !== undefined) room.color = updates.color;
    if (updates.capacity !== undefined) room.capacity = updates.capacity;
    if (updates.maxTemperature !== undefined) room.maxTemperature = updates.maxTemperature;

    await building.save();
    return room;
};
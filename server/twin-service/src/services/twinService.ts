import {Building, type Room} from "../models/twin.js";


export const registerBuilding = async (id: string, rooms: any, domains: string[]) => {
    if (await Building.findOne({ id })) {
        throw new Error("Building already exists");
    }

    const building = new Building({ id, rooms, domains });
    await building.save();
    return building;
};

export const getBuildingById = async (id: string) => {
    const building = await Building.findOne({ id });

    if (!building) {
        throw new Error("Building not found");
    }
    return building;
};

export const getBuildingsByDomain = async (domain: string) => {
    const buildings = await Building.find({ domains: domain });

    if (buildings.length === 0) {
        throw new Error("No buildings found for the specified domain");
    }
    return buildings;
};

export const updateRoomInBuilding = async (buildingId: string, roomId: string, updates: Partial<Room>) => {
    const building = await Building.findOne({ id: buildingId });
    if (!building) throw new Error("Building not found");

    const room = building.rooms.find(r => r.id === roomId);
    if (!room) throw new Error("Room not found");

    if (updates.id !== undefined) room.id = updates.id;
    if (updates.color !== undefined) room.color = updates.color;
    if (updates.capacity !== undefined) room.capacity = updates.capacity;
    if (updates.maxTemperature !== undefined) room.maxTemperature = updates.maxTemperature;

    await building.save();
    return room;
};
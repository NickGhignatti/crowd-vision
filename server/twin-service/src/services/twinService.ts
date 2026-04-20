import {Building, type IBuilding, type Room} from "../models/twin.js";
import {ConflictError, NotFoundError} from "../models/error.js";
import type {HydratedDocument} from "mongoose";

const normalizeBuildingName = (name: string | undefined, id: string): string => {
    return name?.trim() || id;
};

const normalizeRoomNames = (rooms: Room[]): Room[] => {
    return rooms.map((room) => ({
        ...room,
        name: room.name?.trim() || room.id
    }));
};

const backfillNames = async (building: HydratedDocument<IBuilding>) => {
    let changed = false;

    if (!building.name || !building.name.trim()) {
        building.name = building.id;
        changed = true;
    }

    for (const room of building.rooms) {
        if (!room.name || !room.name.trim()) {
            room.name = room.id;
            changed = true;
        }
    }

    if (changed) {
        await building.save();
    }
};


export const registerBuilding = async (id: string, name: string | undefined, rooms: any, domains: string[]) => {
    if (await Building.findOne({ id })) {
        throw new ConflictError(`Building with id: "${id}" already exists`);
    }

    const normalizedBuildingName = normalizeBuildingName(name, id);
    const normalizedRooms = normalizeRoomNames(rooms as Room[]);
    const building = new Building({ id, name: normalizedBuildingName, rooms: normalizedRooms, domains });
    await building.save();
    return building;
};

export const getBuildingById = async (id: string) => {
    const building = await Building.findOne({ id });

    if (!building) {
        throw new NotFoundError(`Building with id: "${id}" not found`);
    }

    await backfillNames(building);
    return building;
};

export const getBuildingsByDomain = async (domain: string) => {
    const buildings = await Building.find({ domains: domain });

    if (buildings.length === 0) {
        throw new NotFoundError(`Building within the domain: "${domain}" not found`);
    }

    await Promise.all(buildings.map((building) => backfillNames(building)));
    return buildings;
};

export const updateRoomInBuilding = async (buildingId: string, roomId: string, updates: Partial<Room>) => {
    const building = await getBuildingById(buildingId);

    const room = building.rooms.find(r => r.id === roomId);
    if (!room) {
        throw new NotFoundError(`Room with id "${roomId}" in the building "${buildingId}" not found`);
    }

    if (updates.id !== undefined) room.id = updates.id;
    if (updates.name !== undefined) room.name = updates.name;
    if (updates.color !== undefined) room.color = updates.color;
    if (updates.capacity !== undefined) room.capacity = updates.capacity;
    if (updates.maxTemperature !== undefined) room.maxTemperature = updates.maxTemperature;

    await building.save();
    return room;
};
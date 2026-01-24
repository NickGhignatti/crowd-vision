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
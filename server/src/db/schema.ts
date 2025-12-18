import { Schema } from 'mongoose';

export interface IUser {
    username: string;
    email: string;
    password: string;
    domain: string;
}

export const userSchema = new Schema<IUser>({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true},
    domain: { type: String, required: false },
});

interface Coordinates {
    x: number;
    y: number;
    z: number;
}

interface Dimensions {
    width: number;
    height: number;
    depth: number;
}

interface Room {
    id: string;
    capacity: number;
    temperature: number;
    no_person: number;
    position: Coordinates;
    dimensions: Dimensions;
    color?: string;
}

export interface IBuilding {
    id: string;
    rooms: Room[];
    domains: string[];
}

const CoordinatesSchema = new Schema<Coordinates>({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    z: { type: Number, required: true }
}, { _id: false });

const DimensionsSchema = new Schema<Dimensions>({
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    depth: { type: Number, required: true }
}, { _id: false });

const RoomSchema = new Schema<Room>({
    id: { type: String, required: true },
    capacity: { type: Number, required: true },
    position: { type: CoordinatesSchema, required: true },
    dimensions: { type: DimensionsSchema, required: true },
    color: { type: String, required: false }
}, {
    _id: false
});

export const buildingSchema = new Schema<IBuilding>({
    id: { type: String, required: true, unique: true },
    rooms: { type: [RoomSchema], required: true },
    domains: { type: [String], required: true },
}, {
    timestamps: true
});
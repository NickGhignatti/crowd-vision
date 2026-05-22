import mongoose, { Schema } from 'mongoose';

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

export interface Room {
    id: string;
    name: string;
    capacity: number;
    temperature: number;
    no_person: number;
    position: Coordinates;
    dimensions: Dimensions;
    color?: string;
}

export interface IBuilding {
    id: string;
    name: string;
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
    name: {
        type: String,
        required: true,
        default: function(this: Room) {
            return this.id;
        }
    },
    capacity: { type: Number, required: true },
    position: { type: CoordinatesSchema, required: true },
    dimensions: { type: DimensionsSchema, required: true },
    color: { type: String, required: false }
}, {
    _id: false
});

export const buildingSchema = new Schema<IBuilding>({
    id: { type: String, required: true, unique: true },
    name: {
        type: String,
        required: true,
        default: function(this: IBuilding) {
            return this.id;
        }
    },
    rooms: { type: [RoomSchema], required: true },
    domains: { type: [String], required: true },
}, {
    timestamps: true
});

// Index for multi-tenant lookups: Building.find({ domains: domainName }) — without
// this, every domain query does a full collection scan.
buildingSchema.index({ domains: 1 });

export const Building = mongoose.model<IBuilding>('Building', buildingSchema);
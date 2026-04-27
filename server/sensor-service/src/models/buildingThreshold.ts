import mongoose, { Schema } from 'mongoose';

export interface ThresholdRoom {
  id: string;
  name: string;
  maxTemperature: number;
}

export interface BuildingThreshold {
  buildingId: string;
  name: string;
  maxTemperature: number;
  rooms: ThresholdRoom[];
}

const ThresholdRoomSchema = new Schema<ThresholdRoom>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    maxTemperature: { type: Number, required: true },
  },
  { _id: false },
);

const BuildingThresholdSchema = new Schema<BuildingThreshold>(
  {
    buildingId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    maxTemperature: { type: Number, required: true },
    rooms: { type: [ThresholdRoomSchema], default: [] },
  },
  { timestamps: true },
);

export const BuildingThresholdModel = mongoose.model<BuildingThreshold>(
  'BuildingThreshold',
  BuildingThresholdSchema,
);

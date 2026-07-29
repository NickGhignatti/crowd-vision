import mongoose, { Schema } from "mongoose";

export interface ThresholdRoom {
  id: string;
  temperature?: {
    maxTemp: number;
    minTemp: number;
  };
  peopleCount?: {
    maxPeople: number;
  };
  airQuality?: {
    maxAqi: number;
    maxCo2: number;
  };
}

export interface BuildingThreshold {
  buildingId: string;
  rooms: ThresholdRoom[];
  temperature?: {
    maxTemp: number;
    minTemp: number;
  };
  peopleCount?: {
    maxPeople: number;
  };
  airQuality?: {
    maxAqi: number;
    maxCo2: number;
  };
}

const ThresholdRoomSchema = new Schema<ThresholdRoom>(
  {
    id: { type: String, required: true },
    temperature: {
      maxTemp: { type: Number },
      minTemp: { type: Number },
    },
    peopleCount: {
      maxPeople: { type: Number },
    },
    airQuality: {
      maxAqi: { type: Number },
      maxCo2: { type: Number },
    },
  },
  { _id: false },
);

const BuildingThresholdSchema = new Schema<BuildingThreshold>(
  {
    buildingId: { type: String, required: true, unique: true },
    rooms: { type: [ThresholdRoomSchema], default: [] },
    temperature: {
      maxTemp: { type: Number },
      minTemp: { type: Number },
    },
    peopleCount: {
      maxPeople: { type: Number },
    },
    airQuality: {
      maxAqi: { type: Number },
      maxCo2: { type: Number },
    },
  },
  { timestamps: true },
);

export const BuildingThresholdModel = mongoose.model<BuildingThreshold>(
  "BuildingThreshold",
  BuildingThresholdSchema,
);

import { Schema } from "mongoose";
import * as mongoose from "mongoose";

export interface ITemperature {
  building: string;
  roomId: string;
  timestamp: number;
  temperature: number;
}

const temperatureSchema = new Schema<ITemperature>({
  building: { type: String, required: true },
  roomId: { type: String, required: true },
  timestamp: { type: Number, required: true },
  temperature: { type: Number, required: true },
});

temperatureSchema.index({ building: 1, timestamp: -1 });
// Compound index for per-room point queries (getLatest, dashboard per-room range scans).
temperatureSchema.index({ building: 1, roomId: 1, timestamp: -1 });

export const Temperature = mongoose.model<ITemperature>(
  "Temperature",
  temperatureSchema,
);

export interface TemperatureParams {
  building: string;
  roomId: string;
}

export interface DashboardTemperatureParams {
  building: string;
  roomId: string;
  timeRange: string;
}

export interface DashboardBuildingTemperatureParams {
  building: string;
  timeRange: string;
}

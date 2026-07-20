import { Schema } from "mongoose";
import * as mongoose from "mongoose";

export interface ITemperature {
  building: string;
  roomId: string;
  timestamp: number;
  temperature: number;
  createdAt?: Date;
}

const temperatureSchema = new Schema<ITemperature>(
  {
    building: { type: String, required: true },
    roomId: { type: String, required: true },
    timestamp: { type: Number, required: true },
    temperature: { type: Number, required: true },
    // `Date.now` (no parens) so each insert is stamped, not the schema-load time.
    createdAt: { type: Date, default: Date.now },
  },
  {
    timeseries: {
      timeField: "createdAt",
      metaField: "building",
      granularity: "seconds",
    },
    expireAfterSeconds: 60 * 60 * 24 * 90,
  },
);

temperatureSchema.index({ building: 1, timestamp: -1 });
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

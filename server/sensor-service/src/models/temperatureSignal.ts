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
    // Native MongoDB time-series collection: bucketed, compressed storage keyed
    // on `building` (the series) over the `createdAt` time axis, with built-in
    // 90-day retention — no separate TTL index needed.
    timeseries: {
      timeField: "createdAt",
      metaField: "building",
      granularity: "seconds",
    },
    expireAfterSeconds: 60 * 60 * 24 * 90,
  },
);

// Secondary indexes for the dashboard's `timestamp`-range and per-room queries,
// which filter on measurement fields rather than the time-series time axis.
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

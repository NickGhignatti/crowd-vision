import { Schema } from "mongoose";
import * as mongoose from "mongoose";

export interface IAirQuality {
  building: string;
  roomId: string;
  timestamp: number;
  scenario?: string;
  pm25: number;
  pm10: number;
  co2: number;
  voc: number;
  temperature: number;
  humidity: number;
  aqi: number;
  indoor_aqi: number;
}

const airQualitySchema = new Schema<IAirQuality>({
  building: { type: String, required: true },
  roomId: { type: String, required: true },
  timestamp: { type: Number, required: true },
  scenario: { type: String, required: false },
  pm25: { type: Number, required: true },
  pm10: { type: Number, required: true },
  co2: { type: Number, required: true },
  voc: { type: Number, required: true },
  temperature: { type: Number, required: true },
  humidity: { type: Number, required: true },
  aqi: { type: Number, required: true },
  indoor_aqi: { type: Number, required: true },
});

airQualitySchema.index({ building: 1, timestamp: -1 });
// Compound index for per-room point queries (getLatest, dashboard per-room range scans).
airQualitySchema.index({ building: 1, roomId: 1, timestamp: -1 });

export const AirQuality = mongoose.model<IAirQuality>(
  "AirQuality",
  airQualitySchema,
);

export interface AirQualityParams {
  building: string;
  roomId: string;
}

export interface DashboardAirQualityParams {
  building: string;
  roomId: string;
  timeRange: string;
}

export interface DashboardBuildingAirQualityParams {
  building: string;
  timeRange: string;
}

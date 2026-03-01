import { Schema } from 'mongoose';
import * as mongoose from "mongoose";

export interface ITemperature {
    twin: string;
    roomId: string;
    timestamp: number;
    temperature: number;
}

const temperatureSchema = new Schema<ITemperature>({
    twin: { type: String, required: true },
    roomId: { type: String, required: true },
    timestamp: { type: Number, required: true },
    temperature: { type: Number, required: true },
});

temperatureSchema.index({ twin: 1, timestamp: -1 });

export const Temperature = mongoose.model<ITemperature>('Temperature', temperatureSchema);

export interface TemperatureParams {
    twin: string;
    roomId: string;
}

export interface DashboardTemperatureParams {
    twin: string;
    roomId: string;
    timeRange: string;
}

export interface DashboardTwinTemperatureParams {
    twin: string;
    timeRange: string;
}
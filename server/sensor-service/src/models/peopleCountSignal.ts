import { Schema } from 'mongoose';
import * as mongoose from "mongoose";

export interface IPeopleCount {
    building: string;
    roomId: string;
    timestamp: number;
    peopleCount: number;
}

const peopleCountSchema = new Schema<IPeopleCount>({
    building: { type: String, required: true },
    roomId: { type: String, required: true },
    timestamp: { type: Number, required: true },
    peopleCount: { type: Number, required: true },
});

peopleCountSchema.index({ building: 1, timestamp: -1 });
// Compound index for per-room point queries (getLatest, dashboard per-room range scans).
peopleCountSchema.index({ building: 1, roomId: 1, timestamp: -1 });

export const PeopleCount = mongoose.model<IPeopleCount>('PeopleCount', peopleCountSchema);

export interface PeopleCountParams {
    building: string;
    roomId: string;
}

export interface DashboardPeopleCountParams {
    building: string;
    roomId: string;
    timeRange: string;
}

export interface DashboardBuildingPeopleCountParams {
    building: string;
    timeRange: string;
}
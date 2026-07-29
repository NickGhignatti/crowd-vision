import { Schema } from 'mongoose';
import * as mongoose from "mongoose";

export interface IPeopleCount {
    building: string;
    roomId: string;
    timestamp: number;
    peopleCount: number;
    createdAt?: Date;
}

const peopleCountSchema = new Schema<IPeopleCount>(
    {
        building: { type: String, required: true },
        roomId: { type: String, required: true },
        timestamp: { type: Number, required: true },
        peopleCount: { type: Number, required: true },
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

// Secondary indexes for `timestamp`-range and per-room queries (measurements).
peopleCountSchema.index({ building: 1, timestamp: -1 });
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
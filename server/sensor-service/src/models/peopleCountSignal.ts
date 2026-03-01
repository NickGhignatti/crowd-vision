import { Schema } from 'mongoose';
import * as mongoose from "mongoose";

export interface IPeopleCount {
    twin: string;
    roomId: string;
    timestamp: number;
    peopleCount: number;
}

const peopleCountSchema = new Schema<IPeopleCount>({
    twin: { type: String, required: true },
    roomId: { type: String, required: true },
    timestamp: { type: Number, required: true },
    peopleCount: { type: Number, required: true },
});

peopleCountSchema.index({ twin: 1, timestamp: -1 });

export const PeopleCount = mongoose.model<IPeopleCount>('PeopleCount', peopleCountSchema);

export interface PeopleCountParams {
    twin: string;
    roomId: string;
}

export interface DashboardPeopleCountParams {
    twin: string;
    roomId: string;
    timeRange: string;
}

export interface DashboardTwinPeopleCountParams {
    twin: string;
    timeRange: string;
}
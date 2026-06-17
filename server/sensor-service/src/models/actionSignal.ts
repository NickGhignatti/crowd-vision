import { Schema } from 'mongoose';
import * as mongoose from "mongoose";

export interface IAction {
    buildingId: string;
    roomId: string;
    sensorId: string;
    sensorType: string;
    timestamp: number;
    actionName: string;
    actionArguments: string;
}

const actionSchema = new Schema<IAction>({
    buildingId: { type: String, required: true },
    roomId: { type: String, required: true },
    sensorId: { type: String, required: true },
    sensorType: { type: String, required: true },
    timestamp: { type: Number, required: true },
    actionName: { type: String, required: true },
    actionArguments: { type: String, required: true },
});

export const Actions = mongoose.model<IAction>('Action', actionSchema);
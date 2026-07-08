import { Schema } from 'mongoose';
import * as mongoose from "mongoose";

export interface ISensor {
    buildingId: string;
    roomId: string;
    sensorId: string;
    sensorType: string;
}

const sensorSchema = new Schema<ISensor>({
    buildingId: { type: String, required: true },
    roomId: { type: String, required: true },
    sensorId: { type: String, required: true },
    sensorType: { type: String, required: true },
});

// A sensor id must be unique within its building/room, but buildings and rooms
// can hold any number of sensors.
sensorSchema.index({ buildingId: 1, roomId: 1, sensorId: 1 }, { unique: true });

export const Sensors = mongoose.model<ISensor>('Sensor', sensorSchema);
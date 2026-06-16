import { Sensors } from "../models/sensor.js";

export class ActionService {
    async getSensorId(roomId: string, buildingId: string): Promise<string | null> {
        try {
            const sensor = await Sensors.findOne({ roomId, buildingId }).exec();
            
            return sensor ? sensor.sensorId : null;
        } catch (error) {
            console.error("Error fetching sensor ID:", error);
            throw new Error("Could not retrieve sensor ID from the database.");
        }
    }  
}
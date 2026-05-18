import { Temperature } from "../models/temperatureSignal.js";
import { BuildingThresholdModel } from "../models/buildingThreshold.js";
import { getTimeRange, getDateRange } from "../utils/dataHelpers.js";
import redisClient from "../config/redis.js";

export class TemperatureService {
  // ── Write Path ────────────────────────────────────────────────────────────
  async persistSignal(
    buildingId: string,
    roomId: string,
    timestamp: number,
    temperature: number,
  ): Promise<void> {
    await Temperature.create({
      building: buildingId,
      roomId,
      timestamp,
      temperature,
    });
    redisClient.publish('telemetry:raw', JSON.stringify({
      type: 'temperature',
      buildingId,
      roomId,
      timestamp,
      value: temperature,
    }));
    await this.evaluateThresholds(buildingId, roomId, temperature);
  }

  // ── Read Path ─────────────────────────────────────────────────────────────
  async getLatest(buildingId: string, roomId: string): Promise<unknown> {
    const result = await Temperature.findOne({ building: buildingId, roomId })
      .sort({ timestamp: -1 })
      .exec();
    if (!result)
      throw new Error(`No temperature data found for ${buildingId} ${roomId}`);
    return result;
  }

  async getAllLatest(buildingId: string): Promise<unknown[]> {
    return Temperature.aggregate([
      { $match: { building: buildingId } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$roomId",
          value: { $first: "$temperature" },
          timestamp: { $first: "$timestamp" },
          building: { $first: "$building" },
        },
      },
      {
        $project: {
          _id: 0,
          roomId: "$_id",
          value: 1,
          timestamp: 1,
          building: 1,
        },
      },
    ]).exec();
  }

  async getDashboardData(
    buildingId: string,
    timeRangeInput: string,
    roomId?: string,
  ): Promise<unknown[]> {
    const validRange = getTimeRange(timeRangeInput);
    const { start, end } = getDateRange(validRange);

    const matchStage: any = {
      building: buildingId,
      timestamp: { $gte: start, $lte: end },
    };
    if (roomId) matchStage.roomId = roomId;

    return Temperature.aggregate([
      { $match: matchStage },
      { $sort: { timestamp: 1 } },
    ]).exec();
  }

  // ── Threshold Logic ───────────────────────────────────────────────────────
  async getBuildingThresholds(buildingId: string): Promise<unknown> {
    const doc = await BuildingThresholdModel.findOne({ buildingId }).exec();
    return doc?.temperature || null;
  }

  async updateBuildingThresholds(
    buildingId: string,
    maxTemp: number,
    minTemp: number,
  ): Promise<unknown> {
    const updated = await BuildingThresholdModel.findOneAndUpdate(
      { buildingId },
      {
        $set: {
          "temperature.maxTemp": maxTemp,
          "temperature.minTemp": minTemp,
        },
      },
      { new: true, upsert: true },
    ).exec();
    return updated.temperature;
  }

  async updateRoomThresholds(
    buildingId: string,
    roomId: string,
    maxTemp: number,
    minTemp: number,
  ): Promise<unknown> {
    const updated = await BuildingThresholdModel.findOneAndUpdate(
      { buildingId },
      { $set: { [`temperature.rooms.${roomId}`]: { maxTemp, minTemp } } },
      { new: true, upsert: true },
    ).exec();
    return updated.temperature;
  }

  async evaluateThresholds(
    buildingId: string,
    roomId: string,
    temperature: number,
  ): Promise<void> {
    try {
      const doc = await BuildingThresholdModel.findOne({ buildingId }).exec();
      const globalConfig = doc?.temperature;
      if (!globalConfig) return;

      // Check for room-specific override, fallback to global building threshold
      const roomConfig =
        (globalConfig as any).rooms?.get?.(roomId) ||
        (globalConfig as any).rooms?.[roomId];
      const activeThreshold = roomConfig || globalConfig;

      if (
        activeThreshold.maxTemp !== undefined &&
        temperature > activeThreshold.maxTemp
      ) {
        console.warn(
          `[ALERT] High Temperature anomaly in ${buildingId} ${roomId}: ${temperature}°C`,
        );
        const eventPayload = JSON.stringify({
          buildingId,
          roomId,
          temperature,
          type: 'temperature',
          timestamp: Date.now(),
        });

        await redisClient.publish('alerts:temperature', eventPayload);
      }
      if (
        activeThreshold.minTemp !== undefined &&
        temperature < activeThreshold.minTemp
      ) {
        console.warn(
          `[ALERT] Low Temperature anomaly in ${buildingId} ${roomId}: ${temperature}°C`,
        );
      }
    } catch (err) {
      console.error(`[TemperatureService] Threshold evaluation failed:`, err);
    }
  }
}

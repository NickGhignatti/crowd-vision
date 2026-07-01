import { Temperature } from "../models/temperatureSignal.js";
import { BuildingThresholdModel } from "../models/buildingThreshold.js";
import {
  getTimeRange,
  getDateRange,
  getAggMode,
  getBucketMs,
  buildAccumulator,
} from "../utils/dataHelpers.js";
import redisClient from "../config/redis.js";

export class TemperatureService {
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
    await this.evaluateThresholds(buildingId, roomId, temperature);
  }

  async getLatest(buildingId: string, roomId: string): Promise<unknown> {
    const result = await Temperature.findOne({ building: buildingId, roomId })
      .sort({ timestamp: -1 })
      .exec();
    if (!result)
      throw new Error(`No temperature data found for ${buildingId} ${roomId}`);
    return result;
  }

  async getAllLatest(buildingId: string): Promise<unknown[]> {
    const cacheKey = `sensor:latest:temperature:${buildingId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await Temperature.aggregate([
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

    await redisClient.setEx(cacheKey, 10, JSON.stringify(result));
    return result;
  }

  async getDashboardData(
    buildingId: string,
    timeRangeInput: string,
    roomId?: string,
    aggModeInput?: string,
  ): Promise<unknown[]> {
    const validRange = getTimeRange(timeRangeInput);
    const mode = getAggMode(aggModeInput);
    const bucketMs = getBucketMs(validRange);
    const { start, end } = getDateRange(validRange);

    const matchStage: any = {
      building: buildingId,
      timestamp: { $gte: start, $lte: end },
    };
    if (roomId) matchStage.roomId = roomId;

    // Floor each timestamp to the nearest bucket boundary using pure arithmetic:
    //   bucket_start = timestamp - (timestamp % bucketMs)
    // This works for any MongoDB version without requiring $dateTrunc (5.0+).
    return Temperature.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $subtract: ["$timestamp", { $mod: ["$timestamp", bucketMs] }],
          },
          value: buildAccumulator(mode, "$temperature"),
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, timestamp: "$_id", value: 1 } },
    ]).exec();
  }

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
      const { maxTemp, minTemp } = activeThreshold;

      // Evaluate each bound independently so the alert carries *which* limit was
      // breached — downstream consumers can phrase/route high vs low differently.
      const breach =
        maxTemp !== undefined && temperature > maxTemp
          ? { direction: "high", threshold: maxTemp }
          : minTemp !== undefined && temperature < minTemp
            ? { direction: "low", threshold: minTemp }
            : undefined;

      if (breach) {
        const eventPayload = JSON.stringify({
          buildingId,
          roomId,
          temperature,
          type: "temperature",
          direction: breach.direction,
          threshold: breach.threshold,
          timestamp: Date.now(),
        });

        await redisClient.publish("alerts:temperature", eventPayload);
      }
    } catch (err) {
      console.error(`[TemperatureService] Threshold evaluation failed:`, err);
    }
  }
}

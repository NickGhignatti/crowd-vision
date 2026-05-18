import { AirQuality } from "../models/airQualitySignal.js";
import { BuildingThresholdModel } from "../models/buildingThreshold.js";
import { getTimeRange, getDateRange } from "../utils/dataHelpers.js";
import redisClient from "../config/redis.js";

export class AirQualityService {
  async persistSignal(payload: any): Promise<void> {
    const indoorAqi = payload.indoor_aqi ?? payload.indoorAqi ?? 0;
    const document: any = {
      building: payload.buildingId,
      roomId: payload.roomId,
      timestamp: payload.timestamp,
      pm25: payload.pm25,
      pm10: payload.pm10,
      co2: payload.co2,
      voc: payload.voc,
      temperature: payload.temperature,
      humidity: payload.humidity,
      aqi: payload.aqi,
      indoor_aqi: indoorAqi,
    };

    if (payload.scenario !== undefined) document.scenario = payload.scenario;

    await AirQuality.create(document);

    redisClient.publish('telemetry:raw', JSON.stringify({
      type: 'airQuality', buildingId: payload.buildingId, roomId: payload.roomId, timestamp: payload.timestamp, value: indoorAqi,
    }));
    await this.evaluateThresholds(
      payload.buildingId,
      payload.roomId,
      payload.co2,
      payload.pm25,
    );
  }

  async getLatest(buildingId: string, roomId: string): Promise<unknown> {
    const result = await AirQuality.findOne({ building: buildingId, roomId })
      .sort({ timestamp: -1 })
      .exec();
    if (!result)
      throw new Error(`No air quality data found for ${buildingId} ${roomId}`);
    return result;
  }

  async getAllLatest(buildingId: string): Promise<unknown[]> {
    return AirQuality.aggregate([
      { $match: { building: buildingId } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$roomId",
          pm25: { $first: "$pm25" },
          co2: { $first: "$co2" },
          indoor_aqi: { $first: "$indoor_aqi" },
          timestamp: { $first: "$timestamp" },
          building: { $first: "$building" },
        },
      },
      {
        $project: {
          _id: 0,
          roomId: "$_id",
          pm25: 1,
          co2: 1,
          timestamp: 1,
          building: 1,
          indoor_aqi: { $ifNull: ["$indoor_aqi", 0] },
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

    return AirQuality.aggregate([
      { $match: matchStage },
      { $sort: { timestamp: 1 } },
    ]).exec();
  }

  async getBuildingThresholds(buildingId: string): Promise<unknown> {
    const doc = await BuildingThresholdModel.findOne({ buildingId }).exec();
    return doc?.airQuality || null;
  }

  async updateBuildingThresholds(
    buildingId: string,
    maxCo2: number,
    maxAqi: number,
  ): Promise<unknown> {
    const updated = await BuildingThresholdModel.findOneAndUpdate(
      { buildingId },
      { $set: { "airQuality.maxCo2": maxCo2, "airQuality.maxAqi": maxAqi } },
      { new: true, upsert: true },
    ).exec();
    return updated.airQuality;
  }

  async updateRoomThresholds(
    buildingId: string,
    roomId: string,
    maxCo2: number,
    maxAqi: number,
  ): Promise<unknown> {
    const updated = await BuildingThresholdModel.findOneAndUpdate(
      { buildingId },
      { $set: { [`airQuality.rooms.${roomId}`]: { maxCo2, maxAqi } } },
      { new: true, upsert: true },
    ).exec();
    return updated.airQuality;
  }

  async evaluateThresholds(
    buildingId: string,
    roomId: string,
    co2: number,
    pm25: number,
  ): Promise<void> {
    try {
      const doc = await BuildingThresholdModel.findOne({ buildingId }).exec();
      const globalConfig = doc?.airQuality;
      if (!globalConfig) return;

      const roomConfig =
        (globalConfig as any).rooms?.get?.(roomId) ||
        (globalConfig as any).rooms?.[roomId];
      const activeThreshold = roomConfig || globalConfig;

      if (
        activeThreshold.maxCo2 !== undefined &&
        co2 > activeThreshold.maxCo2
      ) {
        console.warn(
          `[ALERT] CO2 anomaly in ${buildingId} ${roomId}: ${co2} ppm`,
        );
      }
      // Note: Assuming aqi roughly maps to PM25 severity for this simple check
      if (
        activeThreshold.maxAqi !== undefined &&
        pm25 > activeThreshold.maxAqi
      ) {
        console.warn(
          `[ALERT] AQI/PM2.5 anomaly in ${buildingId} ${roomId}: ${pm25}`,
        );
      }
    } catch (err) {
      console.error(`[AirQualityService] Threshold evaluation failed:`, err);
    }
  }
}

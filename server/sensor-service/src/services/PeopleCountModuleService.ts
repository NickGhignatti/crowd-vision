import { PeopleCount } from "../models/peopleCountSignal.js";
import { BuildingThresholdModel } from "../models/buildingThreshold.js";
import { getTimeRange, getDateRange } from "../utils/dataHelpers.js";

export class PeopleCountService {
  async persistSignal(
    buildingId: string,
    roomId: string,
    timestamp: number,
    peopleCount: number,
  ): Promise<void> {
    await PeopleCount.create({
      building: buildingId,
      roomId,
      timestamp,
      peopleCount,
    });
    await this.evaluateThresholds(buildingId, roomId, peopleCount);
  }

  async getLatest(buildingId: string, roomId: string): Promise<unknown> {
    const result = await PeopleCount.findOne({ building: buildingId, roomId })
      .sort({ timestamp: -1 })
      .exec();
    if (!result)
      throw new Error(`No people count data found for ${buildingId} ${roomId}`);
    return result;
  }

  async getAllLatest(buildingId: string): Promise<unknown[]> {
    return PeopleCount.aggregate([
      { $match: { building: buildingId } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$roomId",
          value: { $first: "$peopleCount" },
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

    return PeopleCount.aggregate([
      { $match: matchStage },
      { $sort: { timestamp: 1 } },
    ]).exec();
  }

  async getBuildingThresholds(buildingId: string): Promise<unknown> {
    const doc = await BuildingThresholdModel.findOne({ buildingId }).exec();
    return doc?.peopleCount || null;
  }

  async updateBuildingThresholds(
    buildingId: string,
    maxPeople: number,
  ): Promise<unknown> {
    const updated = await BuildingThresholdModel.findOneAndUpdate(
      { buildingId },
      { $set: { "peopleCount.maxPeople": maxPeople } },
      { new: true, upsert: true },
    ).exec();
    return updated.peopleCount;
  }

  async updateRoomThresholds(
    buildingId: string,
    roomId: string,
    maxPeople: number,
  ): Promise<unknown> {
    const updated = await BuildingThresholdModel.findOneAndUpdate(
      { buildingId },
      { $set: { [`peopleCount.rooms.${roomId}`]: { maxPeople } } },
      { new: true, upsert: true },
    ).exec();
    return updated.peopleCount;
  }

  async evaluateThresholds(
    buildingId: string,
    roomId: string,
    peopleCount: number,
  ): Promise<void> {
    try {
      const doc = await BuildingThresholdModel.findOne({ buildingId }).exec();
      const globalConfig = doc?.peopleCount;
      if (!globalConfig) return;

      const roomConfig =
        (globalConfig as any).rooms?.get?.(roomId) ||
        (globalConfig as any).rooms?.[roomId];
      const activeThreshold = roomConfig || globalConfig;

      if (
        activeThreshold.maxPeople !== undefined &&
        peopleCount > activeThreshold.maxPeople
      ) {
        console.warn(
          `[ALERT] Overcrowding anomaly in ${buildingId} ${roomId}: ${peopleCount} people`,
        );
        // Trigger notification service
      }
    } catch (err) {
      console.error(`[PeopleCountService] Threshold evaluation failed:`, err);
    }
  }
}

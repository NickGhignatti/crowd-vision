import { ValidationResult } from "./ISensorModule.js";
import { BaseSensorModule, type TelemetryEvent } from "./BaseSensorModule.js";
import { PeopleCount, type IPeopleCount } from "../models/peopleCountSignal.js";
import { PeopleCountService } from "../services/PeopleCountModuleService.js";

export class PeopleCountModule extends BaseSensorModule<IPeopleCount> {
  public readonly type = "peopleCount" as const;
  protected readonly model = PeopleCount;
  private readonly service = new PeopleCountService();

  validate(payload: any): ValidationResult {
    const errors: string[] = [];
    if (!payload.buildingId)
      errors.push("buildingId: must be a non-empty string.");
    if (!payload.roomId)
      errors.push("roomId: must be a non-empty string.");
    if (typeof payload.timestamp !== "number")
      errors.push("timestamp: must be a finite number.");
    if (typeof payload.peopleCount !== "number" || payload.peopleCount < 0)
      errors.push("peopleCount: must be a non-negative integer.");

    return errors.length === 0
      ? ValidationResult.ok()
      : ValidationResult.fail(errors);
  }

  protected async persist(payload: any): Promise<void> {
    await this.service.persistSignal(
      payload.buildingId,
      payload.roomId,
      payload.timestamp,
      payload.peopleCount,
    );
  }

  protected buildTelemetryEvent(payload: any): TelemetryEvent {
    return {
      type: this.type,
      buildingId: payload.buildingId,
      roomId: payload.roomId,
      timestamp: payload.timestamp,
      value: payload.peopleCount,
    };
  }

  async getAllLatest(buildingId: string): Promise<unknown[]> {
    return this.service.getAllLatest(buildingId);
  }

  async getDashboardData(
    buildingId: string,
    timeRange: string,
    roomId?: string,
    aggMode?: string,
  ): Promise<unknown[]> {
    return this.service.getDashboardData(buildingId, timeRange, roomId, aggMode);
  }

  async getThresholds(buildingId: string): Promise<unknown> {
    return this.service.getBuildingThresholds(buildingId);
  }

  async updateBuildingThreshold(
    buildingId: string,
    payload: any,
  ): Promise<unknown> {
    return this.service.updateBuildingThresholds(buildingId, payload.maxPeople);
  }

  async updateRoomThreshold(
    buildingId: string,
    roomId: string,
    payload: any,
  ): Promise<unknown> {
    return this.service.updateRoomThresholds(buildingId, roomId, payload.maxPeople);
  }
}

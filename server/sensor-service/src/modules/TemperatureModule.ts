import { type ISensorModule, ValidationResult } from "./ISensorModule.js";
import { TemperatureService } from "../services/TemperatureModuleService.js";

export class TemperatureModule implements ISensorModule {
  public readonly type = "temperature" as const;
  private readonly service = new TemperatureService();

  validate(payload: any): ValidationResult {
    const errors: string[] = [];
    if (!payload.buildingId)
      errors.push("buildingId: must be a non-empty string.");
    if (!payload.roomId) errors.push("roomId: must be a non-empty string.");
    if (typeof payload.timestamp !== "number")
      errors.push("timestamp: must be a finite number.");
    if (typeof payload.temperature !== "number")
      errors.push("temperature: must be a finite number.");

    return errors.length === 0
      ? ValidationResult.ok()
      : ValidationResult.fail(errors);
  }

  async process(payload: any): Promise<void> {
    await this.service.persistSignal(
      payload.buildingId,
      payload.roomId,
      payload.timestamp,
      payload.temperature,
    );
  }

  async getLatest(buildingId: string, roomId: string): Promise<unknown> {
    return this.service.getLatest(buildingId, roomId);
  }

  async getAllLatest(buildingId: string): Promise<unknown[]> {
    return this.service.getAllLatest(buildingId);
  }

  async getDashboardData(
    buildingId: string,
    timeRange: string,
    roomId?: string,
  ): Promise<unknown[]> {
    return this.service.getDashboardData(buildingId, timeRange, roomId);
  }

  async getThresholds(buildingId: string): Promise<unknown> {
    return this.service.getBuildingThresholds(buildingId);
  }

  async updateBuildingThreshold(
    buildingId: string,
    payload: any,
  ): Promise<unknown> {
    return this.service.updateBuildingThresholds(
      buildingId,
      payload.maxTemp,
      payload.minTemp,
    );
  }

  async updateRoomThreshold(
    buildingId: string,
    roomId: string,
    payload: any,
  ): Promise<unknown> {
    return this.service.updateRoomThresholds(
      buildingId,
      roomId,
      payload.maxTemp,
      payload.minTemp,
    );
  }
}

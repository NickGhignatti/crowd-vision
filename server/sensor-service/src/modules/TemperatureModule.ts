import { ValidationResult } from "./ISensorModule.js";
import { BaseSensorModule, type TelemetryEvent } from "./BaseSensorModule.js";
import { Temperature, type ITemperature } from "../models/temperatureSignal.js";
import { TemperatureService } from "../services/TemperatureModuleService.js";

export class TemperatureModule extends BaseSensorModule<ITemperature> {
  public readonly type = "temperature" as const;
  protected readonly model = Temperature;
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

  protected async persist(payload: any): Promise<void> {
    await this.service.persistSignal(
      payload.buildingId,
      payload.roomId,
      payload.timestamp,
      payload.temperature,
    );
  }

  protected buildTelemetryEvent(payload: any): TelemetryEvent {
    return {
      type: this.type,
      buildingId: payload.buildingId,
      roomId: payload.roomId,
      timestamp: payload.timestamp,
      value: payload.temperature,
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
    return this.service.getDashboardData(
      buildingId,
      timeRange,
      roomId,
      aggMode,
    );
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

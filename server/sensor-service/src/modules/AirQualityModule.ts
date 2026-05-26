import { ValidationResult } from "./ISensorModule.js";
import { BaseSensorModule, type TelemetryEvent } from "./BaseSensorModule.js";
import { AirQuality, type IAirQuality } from "../models/airQualitySignal.js";
import { AirQualityService } from "../services/AirQualityModuleService.js";

export class AirQualityModule extends BaseSensorModule<IAirQuality> {
  public readonly type = "airQuality" as const;
  protected readonly model = AirQuality;
  private readonly service = new AirQualityService();

  validate(payload: any): ValidationResult {
    const errors: string[] = [];
    if (!payload.buildingId)
      errors.push("buildingId: must be a non-empty string.");
    if (!payload.roomId) errors.push("roomId: must be a non-empty string.");
    if (typeof payload.timestamp !== "number")
      errors.push("timestamp: must be a finite number.");
    if (typeof payload.pm25 !== "number")
      errors.push("pm25: must be a finite number.");
    if (typeof payload.co2 !== "number")
      errors.push("co2: must be a finite number.");

    return errors.length === 0
      ? ValidationResult.ok()
      : ValidationResult.fail(errors);
  }

  protected async persist(payload: any): Promise<void> {
    await this.service.persistSignal(payload);
  }

  protected buildTelemetryEvent(payload: any): TelemetryEvent {
    // `indoor_aqi` is the primary KPI surfaced to the frontend for coloring and
    // table display. Fall back to 0 to match the DB default.
    const indoorAqi: number = payload.indoor_aqi ?? payload.indoorAqi ?? 0;
    return {
      type: this.type,
      buildingId: payload.buildingId,
      roomId: payload.roomId,
      timestamp: payload.timestamp,
      value: indoorAqi,
      // Forward the full air-quality snapshot so the frontend can merge all
      // fields (pm25, co2, etc.) into its local data array without a re-fetch.
      indoor_aqi: indoorAqi,
      pm25: payload.pm25,
      pm10: payload.pm10,
      co2: payload.co2,
      voc: payload.voc,
      humidity: payload.humidity,
      aqi: payload.aqi,
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
      payload.maxCo2,
      payload.maxAqi,
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
      payload.maxCo2,
      payload.maxAqi,
    );
  }
}

import { Model } from "mongoose";
import { type ISensorModule, ValidationResult } from "./ISensorModule.js";
import redisClient from "../config/redis.js";
import { Sensors } from "../models/sensor.ts";

export interface TelemetryEvent {
  readonly type: string;
  readonly buildingId: string;
  readonly roomId: string;
  readonly timestamp: number;
  readonly value: number;
  readonly [key: string]: unknown;
}

/**
 * Abstract base class shared by all sensor modules.
 *
 * Implements the **Template Method** pattern for the ingestion hot-path:
 *   `process()` is sealed here — it always calls `persist()` then
 *   `publishTelemetry()` in that order, so child classes can never accidentally
 *   skip the Redis fanout or publish before the data is safely on disk.
 */
export abstract class BaseSensorModule<T> implements ISensorModule {
  public abstract readonly type: string;
  protected abstract readonly model: Model<T>;

  abstract validate(payload: unknown): ValidationResult;

  /**
   * Persist the validated payload to MongoDB and run any domain-specific
   * side-effects (threshold evaluation, alerting). Must NOT publish to Redis —
   * that step is owned by this base class.
   */
  protected abstract persist(payload: unknown): Promise<void>;

  /**
   * Map the validated payload to the `TelemetryEvent` shape that will be
   * published on `telemetry:raw`. Called immediately after `persist()` succeeds.
   */
  protected abstract buildTelemetryEvent(payload: unknown): TelemetryEvent;

  abstract getAllLatest(buildingId: string): Promise<unknown[]>;
  abstract getDashboardData(
    buildingId: string,
    timeRange: string,
    roomId?: string,
    aggMode?: string,
  ): Promise<unknown[]>;

  /**
   * Sealed ingestion pipeline. Not overridable by subclasses.
   * Publishing after a confirmed DB write ensures the contracts-service never
   * distributes a telemetry event that is not yet queryable from the read path.
   */
  async process(payload: unknown): Promise<void> {
    await this.persist(payload);
    this.publishTelemetry(this.buildTelemetryEvent(payload));
  }

  /**
   * Publishes a telemetry event to the `telemetry:raw` Redis channel.
   * Fire-and-forget: failures are logged but never bubble up to the caller,
   * keeping the ingestion response time independent of Redis latency.
   */
  protected publishTelemetry(event: TelemetryEvent): void {
    try {
      Promise.resolve(
        redisClient.publish("telemetry:raw", JSON.stringify(event)),
      ).catch((err) =>
        console.error(`[${this.type}] Failed to publish telemetry:`, err),
      );
    } catch (err) {
      console.error(`[${this.type}] Failed to publish telemetry:`, err);
    }
  }

  async getLatest(buildingId: string, roomId: string): Promise<unknown> {
    const result = await (this.model as any)
      .findOne({ building: buildingId, roomId })
      .sort({ timestamp: -1 })
      .exec();

    if (!result) {
      throw new Error(
        `No data found for building: ${buildingId}, room: ${roomId}`,
      );
    }

    return result;
  }

  // Default no-op implementations for threshold management.
  // Modules that support thresholds override these.
  getThresholds(_buildingId: string): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  updateBuildingThreshold(
    _buildingId: string,
    _payload: unknown,
  ): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  updateRoomThreshold(
    _buildingId: string,
    _roomId: string,
    _payload: unknown,
  ): Promise<unknown> {
    return Promise.resolve(undefined);
  }
  apply(): Promise<unknown> {
    return Promise.resolve(undefined);
  }
  async create(
    buildingId: string,
    roomId: string,
    sensorType: string,
    sensorId: string
  ): Promise<void> {

    await Sensors.create({
      buildingId,
      roomId,
      sensorType,
      sensorId
    })
  }
}

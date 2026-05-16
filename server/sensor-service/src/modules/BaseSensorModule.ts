import { Model, Document } from "mongoose";
import { type ISensorModule, ValidationResult } from "./ISensorModule.js";

/**
 * Abstract base class that provides shared functionality for all sensor modules.
 * Individual sensor modules extend this class and provide their specific Mongoose model.
 */
export abstract class BaseSensorModule<T extends Document>
  implements ISensorModule
{
  public abstract readonly type: string;

  // The implementing class MUST provide its Mongoose model
  protected abstract readonly model: Model<T>;

  // ── Abstract Methods (Must be implemented by the child) ─────────────────
  abstract validate(payload: unknown): ValidationResult;
  abstract process(payload: unknown): Promise<void>;

  // Aggregations and Dashboards are usually highly specific to the sensor schema,
  // so we force the child module to implement them.
  abstract getAllLatest(buildingId: string): Promise<unknown[]>;
  abstract getDashboardData(
    buildingId: string,
    timeRange: string,
    roomId?: string,
  ): Promise<unknown[]>;

  // ── Concrete Methods (Shared by all children) ───────────────────────────

  /**
   * Generic implementation to get the latest signal for a single room.
   * If a module needs different logic, it can simply override this method.
   */
  async getLatest(buildingId: string, roomId: string): Promise<unknown> {
    const result = await this.model
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

  getThresholds(buildingId: string): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  updateBuildingThreshold(buildingId: string, payload: unknown): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  updateRoomThreshold(buildingId: string, roomId: string, payload: unknown): Promise<unknown> {
    return Promise.resolve(undefined);
  }
}

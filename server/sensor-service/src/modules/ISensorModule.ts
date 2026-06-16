/**
 * The structured result of a module's validation check.
 * Immutable to prevent accidental mutation across the call stack.
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

/**
 * Namespace-merged factory for constructing ValidationResult values.
 * Co-locating the factories with the type avoids scattered object literals
 * and gives callers a discoverable, self-documenting API.
 *
 * Usage:
 *   return ValidationResult.ok();
 *   return ValidationResult.fail(['fieldX is required']);
 */
export namespace ValidationResult {
  export const ok = (): ValidationResult =>
    Object.freeze({
      isValid: true,
      errors: Object.freeze([]) as readonly string[],
    });

  export const fail = (errors: string[]): ValidationResult =>
    Object.freeze({ isValid: false, errors: Object.freeze([...errors]) });
}

/**
 * The Strategy interface every sensor module must implement.
 *
 * A module is a fully autonomous unit: it owns its validation rules,
 * its persistence logic, and any domain-specific side effects such as alerting.
 *
 * The SensorKernel interacts with all modules exclusively through this interface,
 * making the system open for extension (new sensor types) while remaining
 * closed for modification (the kernel never changes).
 */
export interface ISensorModule {
  /**
   * A unique, stable string discriminant for the sensor type this module handles.
   * This must match exactly what the HTTP client sends in the `type` field.
   * Examples: 'temperature', 'peopleCount', 'airQuality'
   */
  readonly type: string;

  /**
   * Validates an incoming, untyped HTTP payload.
   *
   * CONTRACT:
   * - Must be pure and synchronous — zero side effects, zero I/O.
   * - Returns a structured result rather than throwing, enabling the controller
   *   to return detailed, machine-readable validation errors to the client
   *   before the connection is closed.
   */
  validate(payload: unknown): ValidationResult;

  /**
   * Persists and fully processes the validated payload.
   *
   * CONTRACT:
   * - Always invoked in a fire-and-forget context, after the HTTP 202 response
   *   has been flushed. Do NOT assume the HTTP connection is still alive.
   * - The caller guarantees `validate()` returned `isValid: true` before this
   *   is invoked. Implementations may therefore cast to their known payload type.
   * - Must be internally resilient: catch and log domain-specific errors rather
   *   than letting them propagate to the kernel's unhandled rejection boundary.
   */
  process(payload: unknown): Promise<void>;

  /** Fetch the single latest record for a specific room */
  getLatest(buildingId: string, roomId: string): Promise<unknown>;

  /** Fetch the latest record for EVERY room in a building */
  getAllLatest(buildingId: string): Promise<unknown[]>;

  /**
   * Fetch time-series data for the dashboards, pre-aggregated into time buckets.
   * Returns `{ timestamp: number, value: number }[]` — one entry per bucket.
   */
  getDashboardData(
    buildingId: string,
    timeRange: string,
    roomId?: string,
    aggMode?: string,
  ): Promise<unknown[]>;

  getThresholds(buildingId: string): Promise<unknown>;
  updateBuildingThreshold(
    buildingId: string,
    payload: unknown,
  ): Promise<unknown>;
  updateRoomThreshold(
    buildingId: string,
    roomId: string,
    payload: unknown,
  ): Promise<unknown>;
  apply(): Promise<unknown>;
  create(
    buildingId: string,
    roomId: string,
    sensorType: string,
    sensorId: string
  ): Promise<unknown>;
}

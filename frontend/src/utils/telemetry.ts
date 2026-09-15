import type { ApiDataPoint } from '@/composables/building/useSensorData.ts'

// Any metric a telemetry plugin registers; the catalog, not this file, says which exist.
export type SensorType = string

export type TelemetryReading = ApiDataPoint & { type: string }

export interface TelemetryTick {
  buildingId: string
  ingestedAt: number
  readings: TelemetryReading[]
}

export const readingsOf = (tick: TelemetryTick | undefined): TelemetryReading[] =>
  tick?.readings ?? []

export const readingsFor = (
  tick: TelemetryTick | undefined,
  buildingId: string | undefined,
  type: string,
): TelemetryReading[] =>
  tick?.buildingId === buildingId ? readingsOf(tick).filter((reading) => reading.type === type) : []

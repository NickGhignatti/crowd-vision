import type { ApiDataPoint } from '@/composables/building/useSensorData.ts'

export type SensorType = 'peopleCount' | 'temperature' | 'airQuality'

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

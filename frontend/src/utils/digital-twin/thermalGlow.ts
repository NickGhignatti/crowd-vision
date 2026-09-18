import type { Room } from '@/types/digital-twin/building.ts'
import { TEMPERATURE_SCALE } from './colors.ts'
import { DEFAULT_MAX_TEMPERATURE } from './thresholds.ts'

// Comfort window in °C below the room's limit; inside it a room glows only gently.
const COMFORT = { from: -8, to: -4 }
const COLDEST = TEMPERATURE_SCALE[0].offset

/** 0 inside the comfort window, rising to 1 at the limit or at the coldest stop. */
export function temperatureDeviation(
  temperature: number,
  maxTemperature = DEFAULT_MAX_TEMPERATURE,
): number {
  const offset = temperature - maxTemperature
  if (offset > COMFORT.to) return Math.min((offset - COMFORT.to) / -COMFORT.to, 1)
  if (offset < COMFORT.from) return Math.min((COMFORT.from - offset) / (COMFORT.from - COLDEST), 1)
  return 0
}

/** Glow strength of a comfortable room; drifting rooms rise from here to 1. */
export const COMFORT_GLOW = 0.35

export interface ThermalGlow {
  room: Room
  strength: number
}

/** Every room with a reading; telemetry sends 0 for a room it has no value for. */
export const thermalGlows = (
  rooms: Room[],
  readings: Record<string, number | undefined>,
): ThermalGlow[] =>
  rooms.flatMap((room) => {
    const value = readings[room.id]
    if (value === undefined || value === 0) return []
    const deviation = temperatureDeviation(value, room.maxTemperature)
    return [{ room, strength: COMFORT_GLOW + (1 - COMFORT_GLOW) * deviation }]
  })

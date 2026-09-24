import type { Room } from '@/types/digital-twin/building.ts'

/** Haze drawing: peak opacity, noise scale per axis, edge softness, and the AQI at which air counts as poor. */
export const AIR_HAZE = {
  opacity: 0.55,
  stretch: { x: 0.18, y: 0.5, z: 0.18 },
  softness: 0.6,
  // Fill threshold: clean air leaves most of the room empty; each unit of density lowers it.
  coverage: { empty: 0.8, perDensity: 0.5 },
  poorAt: 100,
}

const DENSITY = { clean: 0.25, poor: 1 }
const SPEED = { clean: 1.2, poor: 0.25 }

export interface Haze {
  density: number
  speed: number
}

/** Clean air is light and quick; poor air is thick and slow. */
export function hazeFor(iaqi: number): Haze {
  const bad = Math.min(Math.max(iaqi / AIR_HAZE.poorAt, 0), 1)
  return {
    density: DENSITY.clean + (DENSITY.poor - DENSITY.clean) * bad,
    speed: SPEED.clean + (SPEED.poor - SPEED.clean) * bad,
  }
}

export interface AirHaze extends Haze {
  room: Room
  /** Only a room with a reading shows haze; the rest keep their slot, collapsed. */
  lit: boolean
}

/**
 * One entry per room on screen, so the layer keeps its size as readings come and go — a layer
 * that resized would remount and recompile. Telemetry sends 0 for a room it has no value for.
 */
export const airHazes = (rooms: Room[], readings: Record<string, number | undefined>): AirHaze[] =>
  rooms.map((room) => {
    const value = readings[room.id]
    return value === undefined || value === 0
      ? { room, ...hazeFor(0), lit: false }
      : { room, ...hazeFor(value), lit: true }
  })

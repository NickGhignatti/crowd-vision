import type { Coordinates } from './building.ts'

/** A sensor as telemetry owns it: identity only, never coordinates. */
export interface Sensor {
  sensorId: string
  buildingId: string
  name: string
  sensorType: string
  /** `null` for a sensor outside every room. */
  roomId: string | null
  actions: string[]
}

/** Where a sensor sits, owned by digital-twin and keyed by telemetry's sensor id. */
export interface Placement {
  sensorId: string
  position: Coordinates
}

/** A sensor joined with its placement; `position` is `null` until one is saved. */
export interface PlacedSensor extends Sensor {
  position: Coordinates | null
}

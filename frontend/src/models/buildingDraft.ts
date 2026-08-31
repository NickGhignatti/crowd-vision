import type { Coordinates, RoomDimensions } from './building.ts'

export interface RoomThresholdDraft {
  minTemp: number
  maxTemp: number
  maxAqi: number
  maxCo2: number
  maxPeople: number
}

export interface BuildingThresholdDraft {
  minTemp: number
  maxTemp: number
  maxAqi: number
  maxCo2: number
}

export interface RoomDraft {
  id: string
  name: string
  capacity: number
  thresholds: RoomThresholdDraft
  position: Coordinates
  dimensions: RoomDimensions
  color?: string
}

export interface BuildingDraft {
  name: string
  thresholds: BuildingThresholdDraft
  rooms: RoomDraft[]
}

export type SensorDraftType = 'temperature'

export interface SensorRegistrationDraft {
  roomId: string
  sensorId: string
  sensorType: SensorDraftType
}

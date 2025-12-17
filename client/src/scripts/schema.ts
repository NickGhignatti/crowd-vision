interface Coordinates {
  x: number
  y: number
  z: number
}

interface RoomDimensions {
  width: number
  height: number
  depth: number
}

export interface RoomPayload {
  id: string
  temperature: number
  no_person: number

  position: Coordinates
  dimensions: RoomDimensions
  color?: string
}

export interface BuildingPayload {
  id: string
  rooms: RoomPayload[]
}

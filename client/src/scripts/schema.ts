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
  capacity: number
  position: Coordinates
  dimensions: RoomDimensions
  color?: string
}

export interface BuildingPayload {
  id: string
  rooms: RoomPayload[]
  domains: string[]
}

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

export interface Room {
  id: string
  capacity: number
  maxTemperature?: number
  position: Coordinates
  dimensions: RoomDimensions
  color?: string
}

export interface Building {
  id: string
  rooms: Room[]
  domains: string[]
}

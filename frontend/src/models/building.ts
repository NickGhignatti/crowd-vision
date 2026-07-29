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
  name: string
  capacity: number
  maxTemperature?: number
  position: Coordinates
  dimensions: RoomDimensions
  color?: string
}

export interface Building {
  id: string
  name: string
  maxTemperature?: number
  rooms: Room[]
  domains: string[]
}

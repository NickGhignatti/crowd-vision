import type { Coordinates, RoomDimensions } from '@/types/digital-twin/building.ts'

export interface PlacedRoom {
  position: Coordinates
  dimensions: RoomDimensions
}

export interface Floor<T> {
  index: number
  elevation: number
  rooms: T[]
}

/** Storeys read back off the geometry, so an uploaded JSON building previews too. */
export function floorsByElevation<T extends PlacedRoom>(rooms: T[]): Floor<T>[] {
  const byElevation = new Map<number, T[]>()
  for (const room of rooms) {
    byElevation.set(room.position.y, [...(byElevation.get(room.position.y) ?? []), room])
  }
  return [...byElevation]
    .sort(([a], [b]) => a - b)
    .map(([elevation, members], index) => ({ index, elevation, rooms: members }))
}

/** A room's top-left corner seen from above; `position` is its centre. */
export const roomOrigin = ({ position, dimensions }: PlacedRoom) => ({
  x: position.x - dimensions.width / 2,
  z: position.z - dimensions.depth / 2,
})

/** The plan is drawn from above, so its axes are x and z. */
export function planExtent(rooms: PlacedRoom[], padding: number) {
  if (rooms.length === 0) return null
  const minX = Math.min(...rooms.map((r) => roomOrigin(r).x))
  const minZ = Math.min(...rooms.map((r) => roomOrigin(r).z))
  const maxX = Math.max(...rooms.map((r) => roomOrigin(r).x + r.dimensions.width))
  const maxZ = Math.max(...rooms.map((r) => roomOrigin(r).z + r.dimensions.depth))
  const width = maxX - minX
  const depth = maxZ - minZ
  return {
    width,
    depth,
    viewBox: `${minX - padding} ${minZ - padding} ${width + padding * 2} ${depth + padding * 2}`,
  }
}

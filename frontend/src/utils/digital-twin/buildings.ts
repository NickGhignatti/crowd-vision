import type { Room } from '@/types/digital-twin/building.ts'

export interface BuildingOption {
  id: string
  name: string
  domains: string[]
}

export interface DomainGroup {
  name: string
  buildings: BuildingOption[]
}

const matches = (query: string, ...fields: string[]) => {
  const needle = query.trim().toLowerCase()
  return !needle || fields.some((field) => field.toLowerCase().includes(needle))
}

/** Storey elevations, lowest first; the scene's floor filter keys on these. */
export const floorsOf = (rooms: Room[]): number[] =>
  [...new Set(rooms.map((room) => room.position.y))].sort((a, b) => a - b)

export const filterBuildings = (buildings: BuildingOption[], query: string) =>
  buildings.filter((building) => matches(query, building.name, building.id))

export const filterRooms = (rooms: Room[], query: string) =>
  rooms.filter((room) => matches(query, room.name, room.id))

/** A building sits under every domain it belongs to; one with none goes under `fallback`. */
export function groupByDomain(buildings: BuildingOption[], fallback: string): DomainGroup[] {
  const groups = new Map<string, BuildingOption[]>()
  for (const building of buildings) {
    for (const domain of building.domains.length ? building.domains : [fallback]) {
      groups.set(domain, [...(groups.get(domain) ?? []), building])
    }
  }
  return [...groups]
    .map(([name, members]) => ({ name, buildings: members }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

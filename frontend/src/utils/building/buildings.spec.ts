import { describe, expect, it } from 'vitest'
import type { Room } from '@/models/building.ts'
import { filterBuildings, filterRooms, floorsOf, groupByDomain } from './buildings.ts'

const room = (id: string, name: string, y: number): Room => ({
  id,
  name,
  capacity: 10,
  position: { x: 0, y, z: 0 },
  dimensions: { width: 1, height: 1, depth: 1 },
})

const buildings = [
  { id: 'b-1', name: 'Library', domains: ['unibo.it'] },
  { id: 'b-2', name: 'Campus Cesena', domains: ['unibo.it', 'cesena.unibo.it'] },
  { id: 'b-3', name: 'Warehouse', domains: [] },
]

describe('the floors a building has', () => {
  it('lists each storey elevation once, lowest first', () => {
    expect(floorsOf([room('a', 'A', 3), room('b', 'B', 0), room('c', 'C', 3)])).toEqual([0, 3])
  })
})

describe('searching the building list', () => {
  it('matches name or id, ignoring case', () => {
    expect(filterBuildings(buildings, 'LIB').map((b) => b.id)).toEqual(['b-1'])
    expect(filterBuildings(buildings, 'b-3').map((b) => b.id)).toEqual(['b-3'])
  })

  it('keeps everything for a blank query', () => {
    expect(filterBuildings(buildings, '  ')).toHaveLength(3)
  })
})

describe('grouping buildings under their domains', () => {
  it('lists a building under every domain it belongs to, domains sorted', () => {
    expect(groupByDomain(buildings, 'Other')).toEqual([
      { name: 'cesena.unibo.it', buildings: [buildings[1]] },
      { name: 'Other', buildings: [buildings[2]] },
      { name: 'unibo.it', buildings: [buildings[0], buildings[1]] },
    ])
  })

  it('has no group without buildings', () => {
    expect(groupByDomain([], 'Other')).toEqual([])
  })
})

describe('searching the room list', () => {
  it('matches name or id, ignoring case', () => {
    const rooms = [room('lab-1', 'Robotics', 0), room('hall', 'Lecture Hall', 0)]
    expect(filterRooms(rooms, 'hall').map((r) => r.id)).toEqual(['hall'])
    expect(filterRooms(rooms, 'LAB').map((r) => r.id)).toEqual(['lab-1'])
  })
})

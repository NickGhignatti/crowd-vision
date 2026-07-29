import { describe, it, expect } from 'vitest'
import {
  worldToScreen,
  screenToWorld,
  computeHandleResize,
  computeDrawnRoomSeed,
  type PlanViewport,
} from '@/composables/scene/floorPlanGeometry.ts'
import type { Room } from '@/models/building.ts'

const viewport: PlanViewport = { width: 800, height: 600, scale: 20, centerX: 0, centerZ: 0 }

const makeRoom = (overrides: Partial<Room> = {}): Room => ({
  id: 'r1',
  name: 'Room 1',
  capacity: 10,
  position: { x: 0, y: 2, z: 0 },
  dimensions: { width: 4, height: 3, depth: 6 },
  ...overrides,
})

describe('worldToScreen / screenToWorld', () => {
  it('projects the world origin to the viewport center', () => {
    expect(worldToScreen(viewport, 0, 0)).toEqual({ x: 400, y: 300 })
  })

  it('scales world units into pixels', () => {
    expect(worldToScreen(viewport, 1, 0)).toEqual({ x: 420, y: 300 })
    expect(worldToScreen(viewport, 0, 1)).toEqual({ x: 400, y: 320 })
  })

  it('round-trips world -> screen -> world', () => {
    const original = { x: 12.5, z: -7.25 }
    const screen = worldToScreen(viewport, original.x, original.z)
    const back = screenToWorld(viewport, screen.x, screen.y)
    expect(back.x).toBeCloseTo(original.x, 9)
    expect(back.z).toBeCloseTo(original.z, 9)
  })

  it('round-trips screen -> world -> screen', () => {
    const original = { x: 133, y: 402 }
    const world = screenToWorld(viewport, original.x, original.y)
    const back = worldToScreen(viewport, world.x, world.z)
    expect(back.x).toBeCloseTo(original.x, 9)
    expect(back.y).toBeCloseTo(original.y, 9)
  })

  it('respects a non-zero viewport center (panned view)', () => {
    const panned: PlanViewport = { ...viewport, centerX: 10, centerZ: -5 }
    expect(worldToScreen(panned, 10, -5)).toEqual({ x: 400, y: 300 })
  })
})

describe('computeHandleResize', () => {
  const room = makeRoom({ position: { x: 0, y: 2, z: 0 }, dimensions: { width: 4, height: 3, depth: 6 } })
  // room spans x:[-2,2], z:[-3,3]

  it('east handle grows width anchored to the west (min) face', () => {
    const result = computeHandleResize(room, 'e', { x: 5, z: 0 })
    expect(result.width).toBe(7) // 5 - (-2)
    expect(result.widthAnchor).toBe('min')
    expect(result.depth).toBeUndefined()
  })

  it('west handle grows width anchored to the east (max) face', () => {
    const result = computeHandleResize(room, 'w', { x: -6, z: 0 })
    expect(result.width).toBe(8) // 2 - (-6)
    expect(result.widthAnchor).toBe('max')
    expect(result.depth).toBeUndefined()
  })

  it('south handle grows depth anchored to the north (min) face', () => {
    const result = computeHandleResize(room, 's', { x: 0, z: 4 })
    expect(result.depth).toBe(7) // 4 - (-3)
    expect(result.depthAnchor).toBe('min')
    expect(result.width).toBeUndefined()
  })

  it('north handle grows depth anchored to the south (max) face', () => {
    const result = computeHandleResize(room, 'n', { x: 0, z: -5 })
    expect(result.depth).toBe(8) // 3 - (-5)
    expect(result.depthAnchor).toBe('max')
    expect(result.width).toBeUndefined()
  })

  it('a corner handle (se) resizes both axes with the correct anchors', () => {
    const result = computeHandleResize(room, 'se', { x: 5, z: 4 })
    expect(result.width).toBe(7)
    expect(result.widthAnchor).toBe('min')
    expect(result.depth).toBe(7)
    expect(result.depthAnchor).toBe('min')
  })

  it('a corner handle (nw) resizes both axes with the correct anchors', () => {
    const result = computeHandleResize(room, 'nw', { x: -6, z: -5 })
    expect(result.width).toBe(8)
    expect(result.widthAnchor).toBe('max')
    expect(result.depth).toBe(8)
    expect(result.depthAnchor).toBe('max')
  })
})

describe('computeDrawnRoomSeed', () => {
  it('builds a centered room seed from two opposite corners', () => {
    const seed = computeDrawnRoomSeed({ x: -2, z: -3 }, { x: 2, z: 3 }, 4)
    expect(seed.position).toEqual({ x: 0, y: 4, z: 0 })
    expect(seed.dimensions.width).toBe(4)
    expect(seed.dimensions.depth).toBe(6)
  })

  it('normalizes corners given in reverse order', () => {
    const seed = computeDrawnRoomSeed({ x: 2, z: 3 }, { x: -2, z: -3 }, 0)
    expect(seed.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(seed.dimensions.width).toBe(4)
    expect(seed.dimensions.depth).toBe(6)
  })

  it('clamps degenerate (near-zero) drags to a minimum room size', () => {
    const seed = computeDrawnRoomSeed({ x: 0, z: 0 }, { x: 0.01, z: 0.01 }, 0)
    expect(seed.dimensions.width).toBeGreaterThan(0)
    expect(seed.dimensions.depth).toBeGreaterThan(0)
  })
})

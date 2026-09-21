import { describe, expect, it } from 'vitest'

import {
  addSensor,
  mergePlacementBatches,
  changeCount,
  emptyDraft,
  moveSensor,
  removeSensor,
  renameSensor,
  toPlacementBatch,
  toTelemetryBatch,
} from './sensorDraft.ts'
import type { Sensor } from '@/types/digital-twin/sensor.ts'

const point = (x: number) => ({ x, y: 0, z: 0 })

const saved = (sensorId: string, roomId: string | null = 'r1'): Sensor => ({
  sensorId,
  buildingId: 'b1',
  name: `Sensor ${sensorId}`,
  sensorType: 'temperature',
  roomId,
  actions: [],
})

const withNew = () =>
  addSensor(emptyDraft(), {
    ref: 'd1',
    name: 'Router yard',
    sensorType: 'peopleCount',
    roomId: null,
    position: point(4),
  })

describe('an untouched draft', () => {
  it('counts no changes and sends nothing', () => {
    const draft = emptyDraft()
    expect(changeCount(draft)).toBe(0)
    expect(toTelemetryBatch(draft)).toEqual({ create: [], update: [], delete: [] })
    expect(toPlacementBatch(draft, {})).toEqual({ upsert: [], delete: [] })
  })
})

describe('adding a sensor', () => {
  it('becomes one create item carrying its ref', () => {
    const draft = withNew()
    expect(changeCount(draft)).toBe(1)
    expect(toTelemetryBatch(draft).create).toEqual([
      { ref: 'd1', name: 'Router yard', sensorType: 'peopleCount', roomId: null },
    ])
  })

  it('is placed under the id telemetry gives it back', () => {
    const draft = withNew()
    expect(toPlacementBatch(draft, { d1: 'new-id' })).toEqual({
      upsert: [{ sensorId: 'new-id', position: point(4) }],
      delete: [],
    })
  })

  it('is left for the next save when its id is not known yet', () => {
    expect(toPlacementBatch(withNew(), {})).toEqual({ upsert: [], delete: [] })
  })

  it('needs no placement when it was added to a room instead of a point', () => {
    const draft = addSensor(emptyDraft(), {
      ref: 'd2',
      name: 'Lab thermostat',
      sensorType: 'temperature',
      roomId: 'r1',
      position: null,
    })
    expect(toPlacementBatch(draft, { d2: 'new-id' }).upsert).toEqual([])
  })
})

describe('editing a saved sensor', () => {
  it('renames it through one update item', () => {
    const draft = renameSensor(emptyDraft(), saved('s1'), 'Renamed')
    expect(changeCount(draft)).toBe(1)
    expect(toTelemetryBatch(draft).update).toEqual([{ sensorId: 's1', name: 'Renamed' }])
  })

  it('moves it to another room', () => {
    const draft = moveSensor(emptyDraft(), saved('s1'), { roomId: 'r2', position: null })
    expect(toTelemetryBatch(draft).update).toEqual([{ sensorId: 's1', roomId: 'r2' }])
    expect(toPlacementBatch(draft, {}).upsert).toEqual([])
  })

  it('moves it to a point, which changes both services', () => {
    const draft = moveSensor(emptyDraft(), saved('s1'), { roomId: null, position: point(7) })
    expect(toTelemetryBatch(draft).update).toEqual([{ sensorId: 's1', roomId: null }])
    expect(toPlacementBatch(draft, {}).upsert).toEqual([{ sensorId: 's1', position: point(7) }])
  })

  it('collapses several edits of the same sensor into one item', () => {
    const sensor = saved('s1')
    const draft = moveSensor(renameSensor(emptyDraft(), sensor, 'Renamed'), sensor, {
      roomId: 'r2',
      position: null,
    })
    expect(changeCount(draft)).toBe(1)
    expect(toTelemetryBatch(draft).update).toEqual([
      { sensorId: 's1', name: 'Renamed', roomId: 'r2' },
    ])
  })

  it('counts each touched sensor once', () => {
    const draft = renameSensor(renameSensor(emptyDraft(), saved('s1'), 'A'), saved('s2'), 'B')
    expect(changeCount(draft)).toBe(2)
  })
})

describe('removing a sensor', () => {
  it('deletes a saved one in both services', () => {
    const draft = removeSensor(emptyDraft(), saved('s1'))
    expect(changeCount(draft)).toBe(1)
    expect(toTelemetryBatch(draft).delete).toEqual(['s1'])
    expect(toPlacementBatch(draft, {}).delete).toEqual(['s1'])
  })

  it('drops a sensor that was never saved, leaving nothing to send', () => {
    const draft = removeSensor(withNew(), { ref: 'd1' })
    expect(changeCount(draft)).toBe(0)
    expect(toTelemetryBatch(draft)).toEqual({ create: [], update: [], delete: [] })
  })

  it('forgets edits made to it before it was removed', () => {
    const sensor = saved('s1')
    const draft = removeSensor(renameSensor(emptyDraft(), sensor, 'Renamed'), sensor)
    expect(changeCount(draft)).toBe(1)
    expect(toTelemetryBatch(draft).update).toEqual([])
    expect(toTelemetryBatch(draft).delete).toEqual(['s1'])
  })
})

describe('a draft is never mutated in place', () => {
  it('leaves the draft it was given untouched', () => {
    const before = emptyDraft()
    renameSensor(before, saved('s1'), 'Renamed')
    expect(changeCount(before)).toBe(0)
  })
})

describe('mergePlacementBatches', () => {
  it('keeps the newer position when both place the same sensor', () => {
    const merged = mergePlacementBatches(
      { upsert: [{ sensorId: 's1', position: point(1) }], delete: [] },
      { upsert: [{ sensorId: 's1', position: point(9) }], delete: [] },
    )
    expect(merged.upsert).toEqual([{ sensorId: 's1', position: point(9) }])
  })

  it('drops a placement the newer batch deletes', () => {
    const merged = mergePlacementBatches(
      { upsert: [{ sensorId: 's1', position: point(1) }], delete: [] },
      { upsert: [], delete: ['s1'] },
    )
    expect(merged).toEqual({ upsert: [], delete: ['s1'] })
  })

  it('names a deleted sensor once', () => {
    const merged = mergePlacementBatches(
      { upsert: [], delete: ['s1'] },
      { upsert: [], delete: ['s1', 's2'] },
    )
    expect(merged.delete).toEqual(['s1', 's2'])
  })

  it('carries both batches through when they touch different sensors', () => {
    const merged = mergePlacementBatches(
      { upsert: [{ sensorId: 's1', position: point(1) }], delete: [] },
      { upsert: [{ sensorId: 's2', position: point(2) }], delete: ['s3'] },
    )
    expect(merged.upsert).toEqual([
      { sensorId: 's1', position: point(1) },
      { sensorId: 's2', position: point(2) },
    ])
    expect(merged.delete).toEqual(['s3'])
  })
})

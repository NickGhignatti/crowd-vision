import { describe, expect, it } from 'vitest'

import {
  addSensor,
  isUnplaced,
  mergePlacementBatches,
  previewSensors,
  sensorMarkers,
  sensorSprites,
  changeCount,
  draftRef,
  emptyDraft,
  moveSensor,
  removeSensor,
  renameSensor,
  toPlacementBatch,
  toTelemetryBatch,
} from './sensorDraft.ts'
import type { PlacedSensor, Sensor } from '@/types/digital-twin/sensor.ts'

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

describe('previewSensors', () => {
  const placed = (sensorId: string, roomId: string | null = 'r1'): PlacedSensor => ({
    ...saved(sensorId, roomId),
    position: null,
  })

  it('shows saved sensors as they are when nothing is drafted', () => {
    const rows = previewSensors([placed('s1')], emptyDraft())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: 's1', name: 'Sensor s1', roomId: 'r1', state: 'saved' })
  })

  it('shows a drafted rename and move on the saved sensor', () => {
    const sensor = saved('s1')
    const draft = moveSensor(renameSensor(emptyDraft(), sensor, 'Renamed'), sensor, {
      roomId: 'r2',
      position: point(3),
    })
    expect(previewSensors([placed('s1')], draft)[0]).toMatchObject({
      name: 'Renamed',
      roomId: 'r2',
      position: point(3),
      state: 'edited',
    })
  })

  it('hides a sensor drafted for removal', () => {
    const draft = removeSensor(emptyDraft(), saved('s1'))
    expect(previewSensors([placed('s1'), placed('s2')], draft).map((row) => row.key)).toEqual([
      's2',
    ])
  })

  it('lists added sensors after the saved ones, keyed by their ref', () => {
    const rows = previewSensors([placed('s1')], withNew())
    expect(rows.map((row) => [row.key, row.state])).toEqual([
      ['s1', 'saved'],
      ['d1', 'new'],
    ])
    expect(rows[1].target).toEqual({ ref: 'd1' })
  })

  it('points each saved row back at its sensor so edits can target it', () => {
    const rows = previewSensors([placed('s1')], emptyDraft())
    expect(rows[0].target).toMatchObject({ sensorId: 's1' })
  })
})

describe('isUnplaced', () => {
  const row = (roomId: string | null, position: { x: number; y: number; z: number } | null) =>
    previewSensors([{ ...saved('s1', roomId), position }], emptyDraft())[0]

  it('is true for a sensor with neither a room nor a position', () => {
    expect(isUnplaced(row(null, null))).toBe(true)
  })

  it('is false once the sensor has a room or a position', () => {
    expect(isUnplaced(row('r1', null))).toBe(false)
    expect(isUnplaced(row(null, point(2)))).toBe(false)
  })
})

describe('draftRef', () => {
  it('makes a key that is new every time', () => {
    const refs = new Set(Array.from({ length: 200 }, draftRef))
    expect(refs.size).toBe(200)
  })

  it('never looks like a server id', () => {
    expect(draftRef()).toMatch(/^draft-/)
  })
})

describe('sensorMarkers', () => {
  const placedAt = (
    sensorId: string,
    roomId: string | null,
    position: ReturnType<typeof point> | null,
  ) => previewSensors([{ ...saved(sensorId, roomId), position }], emptyDraft())[0]

  it('marks every sensor that has a position, in a room or outdoors', () => {
    const rows = [
      placedAt('s1', 'r1', point(1)),
      placedAt('s2', null, point(9)),
      placedAt('s3', 'r1', null),
    ]
    expect(sensorMarkers(rows).map((row) => row.key)).toEqual(['s1', 's2'])
  })

  it('leaves out the sensor being moved, so it is not drawn twice', () => {
    const rows = [placedAt('s1', 'r1', point(1)), placedAt('s2', null, point(9))]
    expect(sensorMarkers(rows, 's2').map((row) => row.key)).toEqual(['s1'])
  })
})

describe('sensorSprites', () => {
  const placedAt = (
    sensorId: string,
    sensorType: string,
    position: ReturnType<typeof point> | null,
  ) => previewSensors([{ ...saved(sensorId), sensorType, position }], emptyDraft())[0]

  it('gives every placed sensor a sprite, keyed and positioned', () => {
    const rows = [placedAt('s1', 'router', point(3)), placedAt('s2', 'temperature', null)]
    expect(sensorSprites(rows, new Set())).toEqual([
      { key: 's1', name: 'Sensor s1', sensorType: 'router', position: point(3), unsaved: false },
    ])
  })

  it('leaves out kinds switched off in the legend', () => {
    const rows = [placedAt('s1', 'router', point(1)), placedAt('s2', 'temperature', point(2))]
    expect(sensorSprites(rows, new Set(['router'])).map((s) => s.key)).toEqual(['s2'])
  })

  it('leaves out the sensor being moved, which the cursor draws', () => {
    const rows = [placedAt('s1', 'router', point(1))]
    expect(sensorSprites(rows, new Set(), 's1')).toEqual([])
  })

  it('marks a drafted sensor unsaved, so it can be drawn apart', () => {
    const draft = addSensor(emptyDraft(), {
      ref: 'd1',
      name: 'New router',
      sensorType: 'router',
      roomId: null,
      position: point(5),
    })
    const [sprite] = sensorSprites(previewSensors([], draft), new Set())
    expect(sprite).toMatchObject({ key: 'd1', unsaved: true })
  })
})

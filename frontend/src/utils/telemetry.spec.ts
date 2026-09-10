import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readingsFor, readingsOf, type TelemetryTick } from './telemetry.ts'

const fixture = join(__dirname, '../../../schemas/fixtures/telemetry-envelope.json')
const wire = JSON.parse(readFileSync(fixture, 'utf8')) as {
  cases: { name: string; body: TelemetryTick }[]
}
const tick = (name: string) => wire.cases.find((c) => c.name === name)!.body

describe('the tick the server sends', () => {
  it.each(wire.cases)('$name is a tick, not a reading', ({ body }) => {
    expect(body).not.toHaveProperty('type')
    expect(readingsOf(body)).toHaveLength(body.readings.length)
  })

  it.each(wire.cases)('$name carries what a chart reads on every reading', ({ body }) => {
    for (const reading of readingsOf(body)) {
      expect(reading).toMatchObject({
        type: expect.any(String),
        roomId: expect.any(String),
        timestamp: expect.any(Number),
        value: expect.any(Number),
      })
      expect(reading).not.toHaveProperty('buildingId')
      expect(reading).not.toHaveProperty('ingestedAt')
    }
  })

  it('picks one building and one metric out of a multi-room tick', () => {
    const readings = readingsFor(
      tick('a multi-room tick is still one message'),
      'bldg-3f2b4c5d',
      'temperature',
    )
    expect(readings.map((r) => r.roomId)).toEqual(['room-lab-2', 'room-aula-magna'])
  })

  it('ignores a tick for another building', () => {
    expect(
      readingsFor(tick('temperature -- one room, one tick'), 'bldg-other', 'temperature'),
    ).toEqual([])
  })
})

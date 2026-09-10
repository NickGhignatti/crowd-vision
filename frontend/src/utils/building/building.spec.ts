import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Building } from '@/models/building.ts'

const fixture = join(__dirname, '../../../../schemas/fixtures/building.json')
const building = JSON.parse(readFileSync(fixture, 'utf8')) as Building

describe('the building the twin serves', () => {
  it('carries the fields the building list reads', () => {
    expect(building).toMatchObject({ id: expect.any(String), name: expect.any(String) })
    expect(building.domains.every((domain) => typeof domain === 'string')).toBe(true)
  })

  it.each(building.rooms)('room $name carries what the 3D scene places it by', (room) => {
    expect(room).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      capacity: expect.any(Number),
      position: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) },
      dimensions: {
        width: expect.any(Number),
        height: expect.any(Number),
        depth: expect.any(Number),
      },
    })
  })
})

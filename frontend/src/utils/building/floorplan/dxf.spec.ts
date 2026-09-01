import { describe, expect, it } from 'vitest'
import { floorsToBuilding } from './draft.ts'
import { declaredUnitsPerMetre, readDxf } from './dxf.ts'
import office from './__fixtures__/office.dxf?raw'

const build = (source: string, unitsPerMetre: number) => {
  const { shapes, warnings } = readDxf(source)
  return { building: floorsToBuilding([{ floorIndex: 0, shapes }], { unitsPerMetre }), warnings }
}

describe('readDxf', () => {
  it('turns closed polylines with a label inside them into rooms', () => {
    const { building } = build(office, 1000)

    expect(
      building.rooms.map((room) => [room.id, room.dimensions.width, room.dimensions.depth]),
    ).toEqual([
      ['f0-meeting-room', 8, 6],
      ['f0-open-space', 9, 6],
      ['f0-store', 8, 6],
    ])
  })

  it('reads a label out of MTEXT as well as TEXT', () => {
    const { building } = build(office, 1000)

    expect(building.rooms.map((room) => room.name)).toContain('Open Space')
  })

  /**
   * The one axis trap: DXF y points up, the twin's z points down the screen. A reader that
   * passes y through unflipped mirrors the whole floor, which still renders and still
   * registers, so nothing downstream catches it.
   */
  it('flips the y axis, so a room drawn higher up the sheet is nearer the origin', () => {
    const { building } = build(office, 1000)
    const store = building.rooms.find((room) => room.name === 'Store')!
    const meeting = building.rooms.find((room) => room.name === 'Meeting Room')!

    expect(store.position.z).toBeLessThan(meeting.position.z)
  })

  it('drops unlabelled polylines and LINE entities', () => {
    const { building } = build(office, 1000)

    expect(building.rooms).toHaveLength(3)
  })

  it('warns that a block reference hides whatever is inside it', () => {
    const { warnings } = build(office, 1000)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/block/i)
  })

  it('refuses input that is not a DXF drawing', () => {
    expect(() => readDxf('{"rooms":[]}')).toThrow(/dxf/i)
  })

  it('names binary DXF rather than failing as if the file were corrupt', () => {
    expect(() => readDxf('AutoCAD Binary DXF')).toThrow(/binary/i)
  })
})

describe('declaredUnitsPerMetre', () => {
  it('reads $INSUNITS so the calibration field can start on the drawing own answer', () => {
    expect(declaredUnitsPerMetre(office)).toBe(1000)
  })

  it('understands the units a plan is actually drawn in', () => {
    const withUnits = (code: number) =>
      declaredUnitsPerMetre(`0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${code}\n0\nENDSEC\n0\nEOF\n`)

    expect(withUnits(6)).toBe(1)
    expect(withUnits(5)).toBe(100)
    expect(withUnits(4)).toBe(1000)
    expect(withUnits(2)).toBeCloseTo(3.28084, 4)
    expect(withUnits(1)).toBeCloseTo(39.3701, 4)
  })

  it('offers nothing when the drawing declares no units, rather than guessing', () => {
    expect(declaredUnitsPerMetre('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')).toBeNull()
    expect(declaredUnitsPerMetre(office.replace('$INSUNITS', '$IGNORED'))).toBeNull()
  })
})

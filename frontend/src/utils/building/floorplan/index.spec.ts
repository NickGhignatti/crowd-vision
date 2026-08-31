import { describe, expect, it } from 'vitest'
import { PLAN_EXTENSIONS, extractPlans, isPlanFile } from './index.ts'
import simpleOffice from './__fixtures__/simple-office.svg?raw'

const room = (label: string, x: number, y: number) =>
  `<rect x="${x}" y="${y}" width="100" height="100"/><text x="${x + 10}" y="${y + 10}">${label}</text>`

const plan = (...rooms: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg">${rooms.join('')}</svg>`

describe('plan dispatch', () => {
  it('recognises the formats it can extract', () => {
    expect(isPlanFile('ground-floor.svg')).toBe(true)
    expect(isPlanFile('building.json')).toBe(false)
  })

  it('ignores the case of the extension, which the file system does not control', () => {
    expect(isPlanFile('GROUND-FLOOR.SVG')).toBe(true)
  })

  it('is not fooled by a format name inside the file name', () => {
    expect(isPlanFile('svg-export-notes.json')).toBe(false)
  })

  it('routes an SVG to the SVG reader', () => {
    const { building } = extractPlans(
      [{ name: 'ground-floor.svg', source: simpleOffice, floorIndex: 0 }],
      { unitsPerMetre: 20 },
    )

    expect(building.rooms.map((r) => r.id)).toEqual([
      'f0-meeting-room',
      'f0-open-space',
      'f0-lab-1',
    ])
  })

  it('refuses a format it has no reader for', () => {
    expect(() =>
      extractPlans([{ name: 'plan.dxf', source: '0\nSECTION', floorIndex: 0 }], {
        unitsPerMetre: 1,
      }),
    ).toThrow(/dxf/i)
  })

  it('advertises every extension it dispatches on', () => {
    expect(PLAN_EXTENSIONS).toEqual(['svg'])
  })
})

describe('multiple floors', () => {
  it('stacks each storey at its own elevation', () => {
    const { building } = extractPlans(
      [
        { name: 'a.svg', source: plan(room('Hall', 0, 0)), floorIndex: 0 },
        { name: 'b.svg', source: plan(room('Hall', 0, 0)), floorIndex: 1 },
      ],
      { unitsPerMetre: 10 },
    )

    expect(building.rooms.map((r) => [r.id, r.position.y])).toEqual([
      ['f0-hall', 1.5],
      ['f1-hall', 4.5],
    ])
  })

  it('keeps a repeated room name unique across storeys without renumbering either', () => {
    const upload = (floorIndex: number) => ({
      name: `f${floorIndex}.svg`,
      source: plan(room('Office 1', 0, 0)),
      floorIndex,
    })

    const both = extractPlans([upload(0), upload(1)], { unitsPerMetre: 10 })
    const alone = extractPlans([upload(1)], { unitsPerMetre: 10 })

    expect(both.building.rooms.map((r) => r.id)).toEqual(['f0-office-1', 'f1-office-1'])
    // Removing a floor must not rename the rooms on the floors that remain.
    expect(alone.building.rooms.map((r) => r.id)).toEqual(['f1-office-1'])
  })

  it('orders storeys by floor rather than by upload order', () => {
    const { building } = extractPlans(
      [
        { name: 'top.svg', source: plan(room('Attic', 0, 0)), floorIndex: 2 },
        { name: 'bottom.svg', source: plan(room('Lobby', 0, 0)), floorIndex: 0 },
      ],
      { unitsPerMetre: 10 },
    )

    expect(building.rooms.map((r) => r.name)).toEqual(['Lobby', 'Attic'])
  })

  it('normalises every storey against one origin so the floors line up', () => {
    const { building } = extractPlans(
      [
        { name: 'a.svg', source: plan(room('Lobby', 500, 500)), floorIndex: 0 },
        { name: 'b.svg', source: plan(room('Office', 500, 500)), floorIndex: 1 },
      ],
      { unitsPerMetre: 10 },
    )

    const [ground, first] = building.rooms
    expect(first!.position.x).toBe(ground!.position.x)
    expect(first!.position.z).toBe(ground!.position.z)
  })

  it('says which floor a warning came from', () => {
    const { warnings } = extractPlans(
      [
        { name: 'a.svg', source: plan(room('Lobby', 0, 0)), floorIndex: 0 },
        {
          name: 'b.svg',
          source: plan(
            room('Office', 0, 0),
            '<rect transform="rotate(15)" x="0" y="0" width="10" height="10"/>',
          ),
          floorIndex: 1,
        },
      ],
      { unitsPerMetre: 10 },
    )

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/^Floor 1:/)
  })
})

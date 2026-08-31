import { describe, expect, it } from 'vitest'
import { PLAN_EXTENSIONS, declaredScaleOf, extractPlans, isPlanFile } from './index.ts'
import simpleOffice from './__fixtures__/simple-office.svg?raw'
import office from './__fixtures__/office.dxf?raw'

const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer

const room = (label: string, x: number, y: number) =>
  `<rect x="${x}" y="${y}" width="100" height="100"/><text x="${x + 10}" y="${y + 10}">${label}</text>`

const plan = (...rooms: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg">${rooms.join('')}</svg>`

describe('plan dispatch', () => {
  it('recognises the formats it can extract', async () => {
    expect(isPlanFile('ground-floor.svg')).toBe(true)
    expect(isPlanFile('ground-floor.dxf')).toBe(true)
    expect(isPlanFile('ground-floor.pdf')).toBe(true)
    expect(isPlanFile('building.json')).toBe(false)
  })

  it('ignores the case of the extension, which the file system does not control', async () => {
    expect(isPlanFile('GROUND-FLOOR.SVG')).toBe(true)
  })

  it('is not fooled by a format name inside the file name', async () => {
    expect(isPlanFile('svg-export-notes.json')).toBe(false)
  })

  it('routes an SVG to the SVG reader', async () => {
    const { building } = await extractPlans(
      [{ name: 'ground-floor.svg', bytes: bytes(simpleOffice), floorIndex: 0 }],
      { unitsPerMetre: 20 },
    )

    expect(building.rooms.map((r) => r.id)).toEqual([
      'f0-meeting-room',
      'f0-open-space',
      'f0-lab-1',
    ])
  })

  it('refuses a format it has no reader for', async () => {
    // DWG is the one people confuse with DXF, and it is not readable here.
    await expect(
      extractPlans([{ name: 'plan.dwg', bytes: bytes('AC1027'), floorIndex: 0 }], {
        unitsPerMetre: 1,
      }),
    ).rejects.toThrow(/dwg/i)
  })

  it('offers the scale a DXF declares, and nothing for a format that cannot', async () => {
    expect(declaredScaleOf('plan.dxf', bytes(office))).toBe(1000)
    expect(declaredScaleOf('plan.svg', bytes(simpleOffice))).toBeNull()
  })

  it('advertises every extension it dispatches on', async () => {
    expect(PLAN_EXTENSIONS).toEqual(['svg', 'dxf', 'pdf'])
  })
})

describe('multiple floors', () => {
  it('stacks each storey at its own elevation', async () => {
    const { building } = await extractPlans(
      [
        { name: 'a.svg', bytes: bytes(plan(room('Hall', 0, 0))), floorIndex: 0 },
        { name: 'b.svg', bytes: bytes(plan(room('Hall', 0, 0))), floorIndex: 1 },
      ],
      { unitsPerMetre: 10 },
    )

    expect(building.rooms.map((r) => [r.id, r.position.y])).toEqual([
      ['f0-hall', 1.5],
      ['f1-hall', 4.5],
    ])
  })

  it('keeps a repeated room name unique across storeys without renumbering either', async () => {
    const upload = (floorIndex: number) => ({
      name: `f${floorIndex}.svg`,
      bytes: bytes(plan(room('Office 1', 0, 0))),
      floorIndex,
    })

    const both = await extractPlans([upload(0), upload(1)], { unitsPerMetre: 10 })
    const alone = await extractPlans([upload(1)], { unitsPerMetre: 10 })

    expect(both.building.rooms.map((r) => r.id)).toEqual(['f0-office-1', 'f1-office-1'])
    // Removing a floor must not rename the rooms on the floors that remain.
    expect(alone.building.rooms.map((r) => r.id)).toEqual(['f1-office-1'])
  })

  it('orders storeys by floor rather than by upload order', async () => {
    const { building } = await extractPlans(
      [
        { name: 'top.svg', bytes: bytes(plan(room('Attic', 0, 0))), floorIndex: 2 },
        { name: 'bottom.svg', bytes: bytes(plan(room('Lobby', 0, 0))), floorIndex: 0 },
      ],
      { unitsPerMetre: 10 },
    )

    expect(building.rooms.map((r) => r.name)).toEqual(['Lobby', 'Attic'])
  })

  it('normalises every storey against one origin so the floors line up', async () => {
    const { building } = await extractPlans(
      [
        { name: 'a.svg', bytes: bytes(plan(room('Lobby', 500, 500))), floorIndex: 0 },
        { name: 'b.svg', bytes: bytes(plan(room('Office', 500, 500))), floorIndex: 1 },
      ],
      { unitsPerMetre: 10 },
    )

    const [ground, first] = building.rooms
    expect(first!.position.x).toBe(ground!.position.x)
    expect(first!.position.z).toBe(ground!.position.z)
  })

  it('says which floor a warning came from', async () => {
    const { warnings } = await extractPlans(
      [
        { name: 'a.svg', bytes: bytes(plan(room('Lobby', 0, 0))), floorIndex: 0 },
        {
          name: 'b.svg',
          bytes: bytes(
            plan(
              room('Office', 0, 0),
              '<rect transform="rotate(15)" x="0" y="0" width="10" height="10"/>',
            ),
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

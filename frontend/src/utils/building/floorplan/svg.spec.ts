import { describe, expect, it } from 'vitest'
import { extractSvg } from './svg.ts'
import simpleOffice from './__fixtures__/simple-office.svg?raw'
import transformedPlan from './__fixtures__/transformed-plan.svg?raw'

describe('extractSvg', () => {
  it('turns labelled rectangles into centred, metre-scaled rooms', () => {
    const { building, warnings } = extractSvg(simpleOffice, {
      name: 'Cesena Campus',
      unitsPerMetre: 20,
    })

    expect(warnings).toEqual([])
    expect(building.name).toBe('Cesena Campus')
    expect(building.rooms).toEqual([
      {
        id: 'meeting-room',
        name: 'Meeting Room',
        position: { x: 4, y: 1.5, z: 3 },
        dimensions: { width: 8, height: 3, depth: 6 },
      },
      {
        id: 'open-space',
        name: 'Open Space',
        position: { x: 13.5, y: 1.5, z: 3 },
        dimensions: { width: 9, height: 3, depth: 6 },
      },
      {
        id: 'lab-1',
        name: 'Lab 1',
        position: { x: 9, y: 1.5, z: 10 },
        dimensions: { width: 18, height: 3, depth: 6 },
      },
    ])
  })

  it('drops the sheet border, which is a container rather than a room', () => {
    const { building } = extractSvg(simpleOffice, { unitsPerMetre: 20 })

    expect(building.rooms.map((room) => room.name)).not.toContain('Ground Floor')
  })

  it('drops unlabelled shapes, which are walls and furniture', () => {
    const { building } = extractSvg(simpleOffice, { unitsPerMetre: 20 })

    expect(building.rooms).toHaveLength(3)
  })

  it('applies inherited translations and reads polygons and line paths', () => {
    const { building } = extractSvg(transformedPlan, {
      unitsPerMetre: 10,
      floorIndex: 1,
    })

    expect(building.rooms).toEqual([
      {
        id: 'kitchen',
        name: 'Kitchen',
        position: { x: 6, y: 4.5, z: 4 },
        dimensions: { width: 12, height: 3, depth: 8 },
      },
      {
        id: 'store',
        name: 'Store',
        position: { x: 20, y: 4.5, z: 4 },
        dimensions: { width: 12, height: 3, depth: 8 },
      },
    ])
  })

  it('warns about a rotated shape instead of squaring it off silently', () => {
    const { warnings } = extractSvg(transformedPlan, { unitsPerMetre: 10 })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/rotate/)
  })

  it('places the plan at the origin regardless of where it was drawn', () => {
    const drawn = (offset: number) => `
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect x="${offset}" y="${offset}" width="100" height="100"/>
        <text x="${offset + 10}" y="${offset + 10}">Room</text>
      </svg>`

    const near = extractSvg(drawn(0), { unitsPerMetre: 10 })
    const far = extractSvg(drawn(9000), { unitsPerMetre: 10 })

    expect(far.building.rooms[0]!.position).toEqual(near.building.rooms[0]!.position)
  })

  it('keeps ids unique when two rooms share a label', () => {
    const { building } = extractSvg(
      `<svg xmlns="http://www.w3.org/2000/svg">
         <rect x="0" y="0" width="100" height="100"/>
         <text x="10" y="10">Office</text>
         <rect x="200" y="0" width="100" height="100"/>
         <text x="210" y="10">Office</text>
       </svg>`,
      { unitsPerMetre: 10 },
    )

    expect(building.rooms.map((room) => room.id)).toEqual(['office', 'office-2'])
  })

  it('refuses a drawing with no labelled shape rather than yielding an empty building', () => {
    expect(() =>
      extractSvg(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10"/></svg>`,
        { unitsPerMetre: 10 },
      ),
    ).toThrow(/no rooms/i)
  })

  it('refuses input that is not an SVG', () => {
    expect(() => extractSvg('{"rooms":[]}', { unitsPerMetre: 10 })).toThrow(/svg/i)
  })
})

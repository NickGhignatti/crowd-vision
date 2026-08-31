import { describe, expect, it } from 'vitest'
import { PLAN_EXTENSIONS, extractPlan, isPlanFile } from './index.ts'
import simpleOffice from './__fixtures__/simple-office.svg?raw'

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

  it('routes an SVG to the SVG extractor', () => {
    const { building } = extractPlan('ground-floor.svg', simpleOffice, { unitsPerMetre: 20 })

    expect(building.rooms.map((room) => room.id)).toEqual(['meeting-room', 'open-space', 'lab-1'])
  })

  it('refuses a format it has no extractor for', () => {
    expect(() => extractPlan('plan.dxf', '0\nSECTION', { unitsPerMetre: 1 })).toThrow(/dxf/i)
  })

  it('advertises every extension it dispatches on', () => {
    expect(PLAN_EXTENSIONS).toEqual(['svg'])
  })
})

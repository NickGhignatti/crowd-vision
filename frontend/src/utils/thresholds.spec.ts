import { describe, expect, it } from 'vitest'
import { buildingTemperaturePatch, roomTemperaturePatch } from './thresholds.ts'

describe('the temperature threshold telemetry stores', () => {
  it('addresses one room under the temperature metric, with the bound telemetry knows', () => {
    expect(roomTemperaturePatch('b-1', 'room 2', 26)).toEqual({
      path: '/telemetry/thresholds/temperature/buildings/b-1/rooms/room%202',
      body: { maxTemp: 26 },
    })
  })

  it('addresses the whole building under the temperature metric', () => {
    expect(buildingTemperaturePatch('b/1', 28)).toEqual({
      path: '/telemetry/thresholds/temperature/buildings/b%2F1',
      body: { maxTemp: 28 },
    })
  })
})

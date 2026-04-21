import { beforeEach, describe, expect, it } from 'vitest'
import { Mode, useModes } from '@/composables/useModes'
import { roomColorByTemperature, roomColorStandard } from '@/helpers/colors'

describe('useModes', () => {
  beforeEach(() => {
    useModes().currentMode.value = Mode.NoSensor
  })

  it('starts in no-sensor mode', () => {
    expect(useModes().currentMode.value).toBe(Mode.NoSensor)
  })

  it('enables and disables a mode when toggled twice', () => {
    const modes = useModes()

    modes.changeMode(Mode.TemperatureSensor)
    expect(modes.currentMode.value).toBe(Mode.TemperatureSensor)

    modes.changeMode(Mode.TemperatureSensor)
    expect(modes.currentMode.value).toBe(Mode.NoSensor)
  })

  it('returns standard room color when no sensor mode is active', () => {
    const modes = useModes()

    expect(modes.getColorByMode({ temperature: 22 })).toBe(roomColorStandard())
  })

  it('returns standard room color when temperature is missing', () => {
    const modes = useModes()
    modes.changeMode(Mode.TemperatureSensor)

    expect(modes.getColorByMode()).toBe(roomColorStandard())
  })

  it('returns temperature-based room color when temperature mode is active', () => {
    const modes = useModes()
    modes.changeMode(Mode.TemperatureSensor)

    expect(modes.getColorByMode({ temperature: 22 })).toBe(roomColorByTemperature(22))
  })
})


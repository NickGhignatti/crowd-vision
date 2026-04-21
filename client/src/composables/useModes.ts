import { ref } from 'vue'
import { roomColorByTemperature, roomColorStandard } from '@/helpers/colors.ts'

export enum Mode {
  NoSensor,
  TemperatureSensor
}

const currentMode = ref<Mode>(Mode.NoSensor)

export function useModes() {

  const changeMode = (mode: Mode) => {
    if (mode === currentMode.value) {
      currentMode.value = Mode.NoSensor
    } else {
      currentMode.value = mode
    }
  }

  const getColorByMode = ({ temperature }: { temperature?: number } = {}) => {
    if (currentMode.value === Mode.TemperatureSensor && temperature !== undefined) {
      return roomColorByTemperature(temperature)
    }
    return roomColorStandard()
  }

  return {
    currentMode, changeMode, getColorByMode
  }
}

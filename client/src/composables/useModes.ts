import { ref } from 'vue'
import { roomColorByTemperature, roomColorStandard, roomColorByAirQuality } from '@/helpers/colors.ts'

export enum Mode {
  NoSensor,
  TemperatureSensor,
  AirQualitySensor
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

  const getColorByMode = ({ temperature, indoorAqi }: { temperature?: number, indoorAqi?: number } = {}) => {
    if (currentMode.value === Mode.TemperatureSensor && temperature !== undefined) {
      return roomColorByTemperature(temperature)
    }
    if (currentMode.value === Mode.AirQualitySensor && indoorAqi !== undefined) {
      return roomColorByAirQuality(indoorAqi)
    }
    return roomColorStandard()
  }

  return {
    currentMode, changeMode, getColorByMode
  }
}

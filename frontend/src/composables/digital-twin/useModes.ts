import { ref } from 'vue'
import {
  temperatureColor,
  roomColorStandard,
  aqiColor,
} from '@/utils/digital-twin/colors.ts'

export enum Mode {
  NoSensor,
  TemperatureSensor,
  AirQualitySensor,
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

  const getColorByMode = ({
    temperature,
    maxTemperature,
    indoorAqi,
  }: { temperature?: number; maxTemperature?: number; indoorAqi?: number } = {}) => {
    if (currentMode.value === Mode.TemperatureSensor && temperature !== undefined) {
      return temperatureColor(temperature, maxTemperature)
    }
    if (currentMode.value === Mode.AirQualitySensor && indoorAqi !== undefined) {
      return aqiColor(indoorAqi)
    }
    return roomColorStandard()
  }

  return {
    currentMode,
    changeMode,
    getColorByMode,
  }
}

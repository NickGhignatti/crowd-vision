/** Upper temperature limit when neither a room nor its building sets one. */
export const DEFAULT_MAX_TEMPERATURE = 27

export interface ThresholdPatch {
  path: string
  body: Record<string, number>
}

const BASE = '/telemetry/thresholds/temperature/buildings'

// Telemetry names the upper temperature bound `maxTemp`; any other key is refused as not a bound.
const upperBound = (maxTemperature: number) => ({ maxTemp: maxTemperature })

export const buildingTemperaturePatch = (
  buildingId: string,
  maxTemperature: number,
): ThresholdPatch => ({
  path: `${BASE}/${encodeURIComponent(buildingId)}`,
  body: upperBound(maxTemperature),
})

export const roomTemperaturePatch = (
  buildingId: string,
  roomId: string,
  maxTemperature: number,
): ThresholdPatch => ({
  path: `${BASE}/${encodeURIComponent(buildingId)}/rooms/${encodeURIComponent(roomId)}`,
  body: upperBound(maxTemperature),
})

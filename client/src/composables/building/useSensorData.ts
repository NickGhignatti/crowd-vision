/**
 * Shape of a single sensor reading as returned by the `/sensor/.../entireBuilding`
 * REST endpoint and merged with live telemetry. Shared by the sensor-data store
 * and its consumers. (Data fetching now lives in `stores/sensorData.ts` via
 * `useBuildingSensor`; this module only carries the type.)
 */
export interface ApiDataPoint {
  timestamp: string
  roomId: string
  value?: number
  building: string
  // Air Quality fields
  pm25?: number
  pm10?: number
  co2?: number
  voc?: number
  temperature?: number
  humidity?: number
  aqi?: number
  indoor_aqi?: number
  indoorAqi?: number
}

import type { TableBody } from '@/types/dashboard/table.ts'
import { roomColorByTemperature, roomColorByAirQuality } from '@/utils/digital-twin/colors.ts'

/**
 * Per-metric display registry: each metric declares how its cell renders, keyed by
 * `metricKey`, so a new sensor adds an entry here and never touches the table.
 */

export type Renderer = 'text' | 'room' | 'bar' | 'gauge' | 'pill'

export interface MetricDisplay {
  renderer: Renderer
  /** Phosphor icon name, e.g. 'thermometer'. */
  icon?: string
  /** Unit suffix appended after the value, e.g. '°C'. */
  unit?: string
  /** Numeric range for 'bar'; max usually comes from the row (e.g. capacity). */
  range?: (row: TableBody) => { min: number; max: number }
  /** Fill/tint colour, any CSS colour. */
  color?: (value: number, row: TableBody) => string
  /** Optional text formatter for 'text'. */
  format?: (value: unknown) => string
}

/** Occupancy bar fill, on the same bands as `getStatusByOccupants`. */
export function percentColor(value: number, row: TableBody): string {
  const max = row.roomMaxOccupancy || 0
  if (max <= 0 || value <= 0) return 'var(--cv-outline)'
  const ratio = value / max
  if (ratio <= 0.5) return 'var(--cv-primary)'
  if (ratio <= 0.95) return 'var(--cv-warning)'
  return 'var(--cv-error)'
}

export const METRIC_DISPLAY: Record<string, MetricDisplay> = {
  roomName: { renderer: 'room' },
  roomMaxOccupancy: { renderer: 'text', icon: 'chair' },
  peopleCount: {
    renderer: 'bar',
    icon: 'users',
    range: (row) => ({ min: 0, max: row.roomMaxOccupancy || 0 }),
    color: percentColor,
  },
  temperature: {
    renderer: 'gauge',
    icon: 'thermometer',
    unit: '°C',
    color: (v) => roomColorByTemperature(v),
  },
  airQuality: {
    renderer: 'gauge',
    icon: 'wind',
    unit: ' AQI',
    color: (v) => roomColorByAirQuality(v),
  },
  status: { renderer: 'pill' },
}

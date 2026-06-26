import type { TableBody } from '@/models/table.ts'
import { roomColorByTemperature, roomColorByAirQuality } from '@/helpers/colors.ts'

/**
 * Per-metric display registry.
 *
 * The table doesn't know how any sensor renders — each metric *declares* it here,
 * keyed by `metricKey`. Adding a sensor means adding one entry (and a new cell
 * component only if a genuinely new visual is needed), never touching the table or
 * the view. This mirrors the backend sensor microkernel ("add a module, don't touch
 * the core") and keeps the dashboard Open/Closed.
 */

export type Renderer = 'text' | 'bar' | 'gauge' | 'pill'

export interface MetricDisplay {
  renderer: Renderer
  /** Phosphor icon class, e.g. 'ph-thermometer'. */
  icon?: string
  /** Unit suffix appended after the value, e.g. '°C'. */
  unit?: string
  /** Numeric range for 'bar'; max usually comes from the row (e.g. capacity). */
  range?: (row: TableBody) => { min: number; max: number }
  /** Fill/tint colour. Pluggable so it can be %-based OR threshold-based. */
  color?: (value: number, row: TableBody) => string
  /** Optional text formatter for 'text'. */
  format?: (value: unknown) => string
}

/**
 * Fill colour for occupancy bars, aligned with the occupancy status bands in
 * `getStatusByOccupants`: empty → slate, ≤50% → blue, ≤95% → orange, else red.
 */
export function percentColor(value: number, row: TableBody): string {
  const max = Number(row.capacity) || 0
  if (max <= 0 || value <= 0) return '#94A3B8' // slate-400 (empty / unknown)
  const ratio = value / max
  if (ratio <= 0.5) return '#3B82F6' // blue   (normal)
  if (ratio <= 0.95) return '#F97316' // orange (crowded)
  return '#EF4444' // red (full / over)
}

export const METRIC_DISPLAY: Record<string, MetricDisplay> = {
  roomName: { renderer: 'text' },
  roomMaxOccupancy: { renderer: 'text' },
  peopleCount: {
    renderer: 'bar',
    icon: 'ph-users',
    range: (row) => ({ min: 0, max: Number(row.capacity) || 0 }),
    color: percentColor,
  },
  temperature: {
    renderer: 'gauge',
    icon: 'ph-thermometer',
    unit: '°C',
    color: (v) => roomColorByTemperature(v),
  },
  airQuality: {
    renderer: 'gauge',
    icon: 'ph-wind',
    unit: '',
    color: (v) => roomColorByAirQuality(v),
  },
  status: { renderer: 'pill' },
}

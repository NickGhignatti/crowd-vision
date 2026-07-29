import type { TableHeader } from '@/models/table.ts'
import type { MetricContract } from '@/models/table.ts'

export const METRIC_DATA_KEY: Record<string, string> = {
  roomName:         'room',
  roomMaxOccupancy: 'capacity',
  peopleCount:      'people',
  temperature:      'temp',
  airQuality:       'indoorAqi',
  status:           'status',
}

export const DATA_METRIC_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(METRIC_DATA_KEY).map(([mk, dk]) => [dk, mk]),
)

export const METRIC_I18N_KEY: Record<string, string> = {
  roomName:         'model.rooms.editRoom.name',
  roomMaxOccupancy: 'dashboard.table.headers.capacity',
  peopleCount:      'model.rooms.occupancy',
  temperature:      'model.rooms.temperature',
  airQuality:       'dashboard.table.headers.indoorAqi',
  status:           'dashboard.table.headers.status',
}

export const DEFAULT_METRIC_KEYS: string[] = [
  'roomName',
  'roomMaxOccupancy',
  'peopleCount',
  'temperature',
]

export const METRIC_CELL_CLASS: Record<string, string> = {
  roomName:         'font-medium text-slate-900',
  temperature:      'text-slate-900 font-medium',
  roomMaxOccupancy: 'text-slate-900 font-medium',
  peopleCount:      'text-slate-900',
}

/** Builds a TableHeader from a raw metric key string (as stored in contracts-service preferences). */
export const metricKeyToHeader = (metricKey: string): TableHeader => ({
  key:       METRIC_DATA_KEY[metricKey] ?? metricKey,
  metricKey,
  label:     METRIC_I18N_KEY[metricKey] ?? metricKey,
  ...(METRIC_CELL_CLASS[metricKey] ? { cellClass: METRIC_CELL_CLASS[metricKey] } : {}),
})

export const headerId = (h: TableHeader): string => h.metricKey ?? h.key

export const headerFromMetric = (metric: MetricContract, cellClass?: string): TableHeader => ({
  key:       METRIC_DATA_KEY[metric.metricKey] ?? metric.metricKey,
  metricKey: metric.metricKey,
  label:     METRIC_I18N_KEY[metric.metricKey] ?? metric.label,
  ...(cellClass ? { cellClass } : {}),
})

export const enrichHeader = (h: TableHeader): TableHeader => {
  const mk = h.metricKey ?? DATA_METRIC_KEY[h.key]
  if (!mk) return h
  return {
    ...h,
    metricKey: mk,
    label:     METRIC_I18N_KEY[mk] ?? h.label,
  }
}

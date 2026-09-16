import type { TableHeader } from '@/models/table.ts'
import type { MetricContract } from '@/models/table.ts'

export const METRIC_I18N_KEY: Record<string, string> = {
  roomName: 'model.rooms.editRoom.name',
  roomMaxOccupancy: 'dashboard.table.headers.capacity',
  peopleCount: 'model.rooms.occupancy',
  temperature: 'model.rooms.temperature',
  airQuality: 'dashboard.table.headers.indoorAqi',
  status: 'dashboard.table.headers.status',
}

export const METRIC_CELL_CLASS: Record<string, string> = {
  roomName: 'min-w-48',
  temperature: 'whitespace-nowrap',
  roomMaxOccupancy: 'tabular-nums',
  peopleCount: 'min-w-44',
}

/** Builds a TableHeader from a raw metric key string (as stored in dashboard preferences). */
export const metricKeyToHeader = (metricKey: string): TableHeader => ({
  key: metricKey,
  metricKey,
  label: METRIC_I18N_KEY[metricKey] ?? metricKey,
  ...(METRIC_CELL_CLASS[metricKey] ? { cellClass: METRIC_CELL_CLASS[metricKey] } : {}),
})

export const headerId = (h: TableHeader): string => h.metricKey ?? h.key

export const headerFromMetric = (metric: MetricContract, cellClass?: string): TableHeader => ({
  key: metric.kind,
  metricKey: metric.kind,
  label: METRIC_I18N_KEY[metric.kind] ?? metric.label,
  ...(cellClass ? { cellClass } : {}),
})

/** Keys a header by its metric, so it matches the row field `buildRows` fills. */
export const enrichHeader = (h: TableHeader): TableHeader => {
  const mk = h.metricKey ?? h.key
  return {
    ...h,
    key: mk,
    metricKey: mk,
    label: METRIC_I18N_KEY[mk] ?? h.label,
  }
}

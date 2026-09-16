import type { ApiDataPoint } from '@/composables/building/useBuildingHistory.ts'

export type TimeRange = '1D' | '1W' | '1M'
export type Aggregation = 'sum' | 'avg' | 'min' | 'max'

export const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M']
export const AGGREGATIONS: Aggregation[] = ['avg', 'sum', 'min', 'max']

const HOUR = 60 * 60 * 1000
const DAYS: Record<Exclude<TimeRange, '1D'>, number> = { '1W': 7, '1M': 30 }

/** The buckets history comes back in: hourly for a day, daily otherwise, oldest first. */
export function timelineFor(range: TimeRange, now = new Date()): Date[] {
  const end = new Date(now)
  if (range === '1D') {
    end.setMinutes(0, 0, 0)
    return Array.from({ length: 24 }, (_, i) => new Date(end.getTime() - (23 - i) * HOUR))
  }
  end.setHours(0, 0, 0, 0)
  const days = DAYS[range]
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end)
    day.setDate(end.getDate() - (days - 1 - i))
    return day
  })
}

/** One value per bucket; a bucket with no point reads zero. */
export function alignToTimeline(points: ApiDataPoint[], timeline: Date[]): number[] {
  const byTime = new Map(points.map((point) => [Number(point.timestamp), point.value]))
  return timeline.map((date) => byTime.get(date.getTime()) ?? 0)
}

export function timelineLabel(date: Date, range: TimeRange, locale?: string): string {
  return range === '1D'
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

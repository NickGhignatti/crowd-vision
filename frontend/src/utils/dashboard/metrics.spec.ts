import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MetricContract } from '@/types/dashboard/table.ts'
import { enrichHeader, headerFromMetric, metricKeyToHeader } from './metrics.ts'
import i18n from '@/i18n.ts'

const fixture = join(__dirname, '../../../../schemas/fixtures/metric-contract.json')
const catalog = JSON.parse(readFileSync(fixture, 'utf8')) as { metrics: MetricContract[] }

describe('the metric catalog the server serves', () => {
  it.each(catalog.metrics)('$kind carries the fields the table reads', (metric) => {
    expect(metric).toMatchObject({
      kind: expect.any(String),
      label: expect.any(String),
      interface: expect.any(String),
    })
  })

  it.each(catalog.metrics)('$kind becomes a column keyed by its metric', (metric) => {
    const header = headerFromMetric(metric)
    expect(header.key).toBe(metric.kind)
    expect(header.metricKey).toBe(metric.kind)
    expect(header.label).toEqual(expect.any(String))
  })
})

describe('columns restored from saved preferences', () => {
  // Preferences store metric keys, and rows are filled by metric key, so a second name would never match.
  it.each(['roomName', 'roomMaxOccupancy', 'totalDeviceCount'])(
    '%s is keyed by itself',
    (metricKey) => {
      expect(metricKeyToHeader(metricKey)).toMatchObject({ key: metricKey, metricKey })
    },
  )

  it('a header without a metric key takes its own key as one', () => {
    expect(enrichHeader({ key: 'temperature', label: 'Temperature' }).metricKey).toBe('temperature')
  })
})

// A label that is not an i18n key renders as the raw metric name and logs a missing-key warning.
describe('every metric the server serves has a translated column label', () => {
  const locales = ['en', 'it'] as const
  it.each(catalog.metrics.flatMap((m) => locales.map((locale) => [m.kind, locale] as const)))(
    '%s in %s',
    (kind, locale) => {
      expect(i18n.global.te(metricKeyToHeader(kind).label, locale)).toBe(true)
    },
  )
})

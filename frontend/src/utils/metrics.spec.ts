import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MetricContract } from '@/models/table.ts'
import { headerFromMetric, valueField } from './metrics.ts'

const fixture = join(__dirname, '../../../schemas/fixtures/metric-contract.json')
const catalog = JSON.parse(readFileSync(fixture, 'utf8')) as { metrics: MetricContract[] }

describe('the metric catalog the server serves', () => {
  it.each(catalog.metrics)('$kind carries the fields the table reads', (metric) => {
    expect(metric).toMatchObject({
      kind: expect.any(String),
      label: expect.any(String),
      interface: expect.any(String),
      value: expect.any(String),
      fields: expect.any(Array),
    })
  })

  it.each(catalog.metrics)('$kind reads a field it declares', (metric) => {
    expect(metric.fields.map((field) => field.name)).toContain(valueField(metric))
  })

  it('reads the field the catalog names, not the kind', () => {
    const airQuality = catalog.metrics.find((metric) => metric.kind === 'airQuality')!
    expect(valueField(airQuality)).toBe('indoor_aqi')
  })

  // The crate defaults an absent value to empty so a lagging source keeps its metrics.
  it('falls back to the kind when a source sends no value', () => {
    const lagging = { ...catalog.metrics[0]!, value: '' }
    expect(valueField(lagging)).toBe(lagging.kind)
  })

  it.each(catalog.metrics)('$kind becomes a table column', (metric) => {
    const header = headerFromMetric(metric)
    expect(header.metricKey).toBe(metric.kind)
    expect(header.key).toEqual(expect.any(String))
    expect(header.label).toEqual(expect.any(String))
  })
})

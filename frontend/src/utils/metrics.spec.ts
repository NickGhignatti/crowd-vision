import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MetricContract } from '@/models/table.ts'
import { headerFromMetric } from './metrics.ts'

const fixture = join(__dirname, '../../../schemas/fixtures/metric-contract.json')
const catalog = JSON.parse(readFileSync(fixture, 'utf8')) as { metrics: MetricContract[] }

describe('the metric catalog the server serves', () => {
  it.each(catalog.metrics)('$kind carries the fields the table reads', (metric) => {
    expect(metric).toMatchObject({
      kind: expect.any(String),
      label: expect.any(String),
      interface: expect.any(String),
    })
  })

  it.each(catalog.metrics)('$kind becomes a table column', (metric) => {
    const header = headerFromMetric(metric)
    expect(header.metricKey).toBe(metric.kind)
    expect(header.key).toEqual(expect.any(String))
    expect(header.label).toEqual(expect.any(String))
  })
})

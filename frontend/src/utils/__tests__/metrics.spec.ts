import { describe, it, expect } from 'vitest'
import {
  METRIC_DATA_KEY,
  DATA_METRIC_KEY,
  METRIC_I18N_KEY,
  DEFAULT_METRIC_KEYS,
  METRIC_CELL_CLASS,
  metricKeyToHeader,
  headerFromMetric,
  enrichHeader,
  headerId,
} from '../metrics'
import type { TableHeader, MetricContract } from '@/models/table'

/**
 * Tests for the metric mapping utilities in utils/metrics.ts.
 *
 * These helpers bridge the contracts-service (which stores metric keys as
 * strings) with the table rendering layer (which needs full TableHeader
 * objects).  They are all pure functions — no I/O, no side effects.
 */

// ── METRIC_DATA_KEY / DATA_METRIC_KEY ────────────────────────────────────────

describe('METRIC_DATA_KEY', () => {
  it('contains all six expected metric keys', () => {
    const keys = Object.keys(METRIC_DATA_KEY)
    expect(keys).toContain('roomName')
    expect(keys).toContain('roomMaxOccupancy')
    expect(keys).toContain('peopleCount')
    expect(keys).toContain('temperature')
    expect(keys).toContain('airQuality')
    expect(keys).toContain('status')
  })

  it('maps metric keys to the correct data field names', () => {
    expect(METRIC_DATA_KEY['roomName']).toBe('room')
    expect(METRIC_DATA_KEY['roomMaxOccupancy']).toBe('capacity')
    expect(METRIC_DATA_KEY['peopleCount']).toBe('people')
    expect(METRIC_DATA_KEY['temperature']).toBe('temp')
    expect(METRIC_DATA_KEY['airQuality']).toBe('indoorAqi')
    expect(METRIC_DATA_KEY['status']).toBe('status')
  })
})

describe('DATA_METRIC_KEY', () => {
  it('is the exact inverse of METRIC_DATA_KEY (round-trip for every entry)', () => {
    for (const [metricKey, dataKey] of Object.entries(METRIC_DATA_KEY)) {
      expect(DATA_METRIC_KEY[dataKey]).toBe(metricKey)
    }
  })

  it('has the same number of entries as METRIC_DATA_KEY', () => {
    expect(Object.keys(DATA_METRIC_KEY).length).toBe(
      Object.keys(METRIC_DATA_KEY).length,
    )
  })
})

// ── DEFAULT_METRIC_KEYS ───────────────────────────────────────────────────────

describe('DEFAULT_METRIC_KEYS', () => {
  it('contains the four expected default columns', () => {
    expect(DEFAULT_METRIC_KEYS).toEqual(
      expect.arrayContaining(['roomName', 'roomMaxOccupancy', 'peopleCount', 'temperature']),
    )
  })

  it('every default key exists in METRIC_DATA_KEY', () => {
    for (const key of DEFAULT_METRIC_KEYS) {
      expect(METRIC_DATA_KEY).toHaveProperty(key)
    }
  })
})

// ── metricKeyToHeader ─────────────────────────────────────────────────────────

describe('metricKeyToHeader', () => {
  it('uses the data-field name as the header key for a known metric', () => {
    const h = metricKeyToHeader('roomName')
    expect(h.key).toBe('room')
  })

  it('preserves the metricKey on the returned header', () => {
    const h = metricKeyToHeader('temperature')
    expect(h.metricKey).toBe('temperature')
  })

  it('sets the label to the i18n key for a known metric', () => {
    const h = metricKeyToHeader('peopleCount')
    expect(h.label).toBe(METRIC_I18N_KEY['peopleCount'])
  })

  it('includes cellClass when METRIC_CELL_CLASS defines one for the metric', () => {
    const h = metricKeyToHeader('roomName')
    expect(h.cellClass).toBe(METRIC_CELL_CLASS['roomName'])
  })

  it('omits cellClass when METRIC_CELL_CLASS has no entry for the metric', () => {
    // 'airQuality' has no cell class defined
    const h = metricKeyToHeader('airQuality')
    expect(h).not.toHaveProperty('cellClass')
  })

  it('falls back to the raw key as both key and label for an unknown metric', () => {
    const h = metricKeyToHeader('unknownMetric')
    expect(h.key).toBe('unknownMetric')
    expect(h.label).toBe('unknownMetric')
    expect(h.metricKey).toBe('unknownMetric')
  })

  it('produces a valid header for every known metric key', () => {
    for (const metricKey of Object.keys(METRIC_DATA_KEY)) {
      const h = metricKeyToHeader(metricKey)
      expect(h.key).toBeTruthy()
      expect(h.metricKey).toBe(metricKey)
      expect(typeof h.label).toBe('string')
    }
  })
})

// ── headerFromMetric ──────────────────────────────────────────────────────────

describe('headerFromMetric', () => {
  const makeMetric = (metricKey: string): MetricContract => ({
    metricKey,
    label: `Label for ${metricKey}`,
    interfaceName: 'ITest',
  })

  it('uses the mapped data key as the header key', () => {
    const h = headerFromMetric(makeMetric('temperature'))
    expect(h.key).toBe('temp')
  })

  it('preserves the metricKey', () => {
    const h = headerFromMetric(makeMetric('peopleCount'))
    expect(h.metricKey).toBe('peopleCount')
  })

  it('uses the i18n key as the label when available', () => {
    const h = headerFromMetric(makeMetric('roomName'))
    expect(h.label).toBe(METRIC_I18N_KEY['roomName'])
  })

  it('falls back to the MetricContract label when no i18n key exists', () => {
    const metric: MetricContract = { metricKey: 'custom', label: 'Custom Label', interfaceName: 'ICustom' }
    const h = headerFromMetric(metric)
    expect(h.label).toBe('Custom Label')
  })

  it('attaches the provided cellClass', () => {
    const h = headerFromMetric(makeMetric('temperature'), 'font-bold')
    expect(h.cellClass).toBe('font-bold')
  })

  it('omits cellClass when none is passed', () => {
    const h = headerFromMetric(makeMetric('temperature'))
    expect(h).not.toHaveProperty('cellClass')
  })
})

// ── enrichHeader ──────────────────────────────────────────────────────────────

describe('enrichHeader', () => {
  it('returns the header unchanged when neither metricKey nor a reverse-lookup exist', () => {
    const h: TableHeader = { key: 'unknownField', label: 'Some Label' }
    expect(enrichHeader(h)).toEqual(h)
  })

  it('resolves metricKey from the data-key via DATA_METRIC_KEY when missing', () => {
    const h: TableHeader = { key: 'room', label: 'Old Label' }
    const enriched = enrichHeader(h)
    expect(enriched.metricKey).toBe('roomName')
  })

  it('updates the label to the i18n key when a metricKey is resolved', () => {
    const h: TableHeader = { key: 'room', label: 'Old Label' }
    const enriched = enrichHeader(h)
    expect(enriched.label).toBe(METRIC_I18N_KEY['roomName'])
  })

  it('preserves an existing metricKey rather than overwriting it', () => {
    const h: TableHeader = { key: 'room', metricKey: 'roomName', label: 'Old Label' }
    const enriched = enrichHeader(h)
    expect(enriched.metricKey).toBe('roomName')
  })

  it('preserves all other header fields', () => {
    const h: TableHeader = { key: 'temp', label: 'Old', cellClass: 'font-bold' }
    const enriched = enrichHeader(h)
    expect(enriched.cellClass).toBe('font-bold')
  })
})

// ── headerId ──────────────────────────────────────────────────────────────────

describe('headerId', () => {
  it('returns metricKey when it is present', () => {
    const h: TableHeader = { key: 'room', metricKey: 'roomName', label: 'Room' }
    expect(headerId(h)).toBe('roomName')
  })

  it('falls back to key when metricKey is absent', () => {
    const h: TableHeader = { key: 'customField', label: 'Custom' }
    expect(headerId(h)).toBe('customField')
  })

  it('prefers metricKey over key when both are present', () => {
    const h: TableHeader = { key: 'someKey', metricKey: 'someMetricKey', label: 'Test' }
    expect(headerId(h)).toBe('someMetricKey')
  })
})

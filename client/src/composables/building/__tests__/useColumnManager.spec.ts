import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { ref, nextTick, type Ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useColumnManager } from '../useColumnManager'
import { makeRequest } from '@/composables/core/useApi'
import type { TableHeader, MetricContract } from '@/models/table'

/**
 * Tests for useColumnManager.ts.
 *
 * This composable manages the interactive column editor on the dashboard.
 * It owns local header state, fetches the available metrics catalog from the
 * API, and persists user preferences per building.
 *
 * Mocking strategy:
 *  – `makeRequest` is mocked globally so no HTTP calls are made.
 *  – `selectedBuildingId` starts as `undefined` to prevent the immediate
 *    `watch` from firing an API call before each test can set up its mock.
 */

vi.mock('@/composables/core/useApi', () => ({
  makeRequest: vi.fn(),
}))

const makeResponse = (ok: boolean, body: unknown = {}) => ({
  ok,
  json: vi.fn().mockResolvedValue(body),
})

const makeHeader = (metricKey: string, key = metricKey): TableHeader => ({
  key,
  metricKey,
  label: `Label ${metricKey}`,
})

const makeMetric = (metricKey: string): MetricContract => ({
  metricKey,
  label: `Metric ${metricKey}`,
  interfaceName: 'ITest',
})

describe('useColumnManager', () => {
  let headers: Ref<TableHeader[]>
  let selectedBuildingId: ReturnType<typeof ref<string | undefined>>
  let onSaved: Mock<(headers: TableHeader[]) => void>

  beforeEach(async () => {
    headers = ref([])
    // undefined → the immediate watch fires but returns early (no API call)
    selectedBuildingId = ref<string | undefined>(undefined)
    onSaved = vi.fn()
  })

  // ── Initial state ─────────────────────────────────────────────────────────

  it('initialises localHeaders from the parent headers prop', () => {
    const h = makeHeader('roomName', 'room')
    headers.value = [h]
    const { localHeaders } = useColumnManager(headers, selectedBuildingId, onSaved)
    expect(localHeaders.value[0]!.metricKey).toBe('roomName')
  })

  it('starts with isEditMode = false', () => {
    const { isEditMode } = useColumnManager(headers, selectedBuildingId, onSaved)
    expect(isEditMode.value).toBe(false)
  })

  it('starts with showAddPanel = false', () => {
    const { showAddPanel } = useColumnManager(headers, selectedBuildingId, onSaved)
    expect(showAddPanel.value).toBe(false)
  })

  it('starts with activeHeaderKey = null', () => {
    const { activeHeaderKey } = useColumnManager(headers, selectedBuildingId, onSaved)
    expect(activeHeaderKey.value).toBeNull()
  })

  // ── handleDeleteColumn ────────────────────────────────────────────────────

  describe('handleDeleteColumn', () => {
    it('removes the target column by metricKey', () => {
      headers.value = [makeHeader('roomName', 'room'), makeHeader('temperature', 'temp')]
      const { localHeaders, handleDeleteColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      handleDeleteColumn(makeHeader('roomName', 'room'))
      expect(localHeaders.value.map((h) => h.metricKey)).not.toContain('roomName')
    })

    it('preserves all other columns', () => {
      headers.value = [makeHeader('roomName', 'room'), makeHeader('temperature', 'temp')]
      const { localHeaders, handleDeleteColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      handleDeleteColumn(makeHeader('roomName', 'room'))
      expect(localHeaders.value.map((h) => h.metricKey)).toContain('temperature')
    })

    it('is a no-op when the header does not exist', () => {
      headers.value = [makeHeader('roomName', 'room')]
      const { localHeaders, handleDeleteColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      const before = localHeaders.value.length
      handleDeleteColumn(makeHeader('nonExistent'))
      expect(localHeaders.value.length).toBe(before)
    })

    it('clears activeHeaderKey when the active column is deleted', () => {
      headers.value = [makeHeader('roomName', 'room')]
      const { activeHeaderKey, handleDeleteColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      activeHeaderKey.value = 'roomName'
      handleDeleteColumn(makeHeader('roomName', 'room'))
      expect(activeHeaderKey.value).toBeNull()
    })
  })

  // ── handleAddColumn ───────────────────────────────────────────────────────

  describe('handleAddColumn', () => {
    it('appends a new column', () => {
      const { localHeaders, handleAddColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      handleAddColumn(makeMetric('peopleCount'))
      expect(localHeaders.value.map((h) => h.metricKey)).toContain('peopleCount')
    })

    it('is a no-op (deduplication) when the metric is already present', () => {
      headers.value = [makeHeader('roomName', 'room')]
      const { localHeaders, handleAddColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      handleAddColumn(makeMetric('roomName'))
      expect(localHeaders.value.filter((h) => h.metricKey === 'roomName').length).toBe(1)
    })

    it('closes the add panel after a successful add', () => {
      const { showAddPanel, handleAddColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      showAddPanel.value = true
      handleAddColumn(makeMetric('newMetric'))
      expect(showAddPanel.value).toBe(false)
    })
  })

  // ── handleSwapColumn ──────────────────────────────────────────────────────

  describe('handleSwapColumn', () => {
    it('replaces the column at activeHeaderKey with the new metric', () => {
      headers.value = [makeHeader('roomName', 'room'), makeHeader('temperature', 'temp')]
      const { localHeaders, activeHeaderKey, handleSwapColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      activeHeaderKey.value = 'roomName'
      handleSwapColumn(makeMetric('peopleCount'))
      expect(localHeaders.value[0]!.metricKey).toBe('peopleCount')
    })

    it('does not allow swapping to a metric already used in another column', () => {
      headers.value = [makeHeader('roomName', 'room'), makeHeader('temperature', 'temp')]
      const { localHeaders, activeHeaderKey, handleSwapColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      activeHeaderKey.value = 'roomName'
      // 'temperature' is already in another slot → swap must be rejected
      handleSwapColumn(makeMetric('temperature'))
      expect(localHeaders.value[0]!.metricKey).toBe('roomName') // unchanged
    })

    it('clears activeHeaderKey after a successful swap', () => {
      headers.value = [makeHeader('roomName', 'room')]
      const { activeHeaderKey, handleSwapColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      activeHeaderKey.value = 'roomName'
      handleSwapColumn(makeMetric('peopleCount'))
      expect(activeHeaderKey.value).toBeNull()
    })

    it('is a no-op when activeHeaderKey is null', () => {
      headers.value = [makeHeader('roomName', 'room')]
      const { localHeaders, handleSwapColumn } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      // activeHeaderKey stays null
      handleSwapColumn(makeMetric('peopleCount'))
      expect(localHeaders.value[0]!.metricKey).toBe('roomName') // unchanged
    })
  })

  // ── handleReorderColumns ──────────────────────────────────────────────────

  describe('handleReorderColumns', () => {
    it('moves a column from the first position to the last', () => {
      headers.value = [
        makeHeader('a'), makeHeader('b'), makeHeader('c'),
      ]
      const { localHeaders, handleReorderColumns } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      handleReorderColumns(0, 2)
      expect(localHeaders.value.map((h) => h.metricKey)).toEqual(['b', 'c', 'a'])
    })

    it('moves a column from the last position to the first', () => {
      headers.value = [
        makeHeader('a'), makeHeader('b'), makeHeader('c'),
      ]
      const { localHeaders, handleReorderColumns } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      handleReorderColumns(2, 0)
      expect(localHeaders.value.map((h) => h.metricKey)).toEqual(['c', 'a', 'b'])
    })

    it('swaps two adjacent columns', () => {
      headers.value = [makeHeader('a'), makeHeader('b')]
      const { localHeaders, handleReorderColumns } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      handleReorderColumns(0, 1)
      expect(localHeaders.value.map((h) => h.metricKey)).toEqual(['b', 'a'])
    })

    it('is a no-op when from === to', () => {
      headers.value = [makeHeader('a'), makeHeader('b'), makeHeader('c')]
      const { localHeaders, handleReorderColumns } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      handleReorderColumns(1, 1)
      expect(localHeaders.value.map((h) => h.metricKey)).toEqual(['a', 'b', 'c'])
    })
  })

  // ── addableMetrics computed ───────────────────────────────────────────────

  describe('addableMetrics', () => {
    it('returns all available metrics when no column is yet added', () => {
      const { availableMetrics, addableMetrics } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      availableMetrics.value = [makeMetric('a'), makeMetric('b')]
      expect(addableMetrics.value.map((m) => m.metricKey)).toEqual(['a', 'b'])
    })

    it('excludes metrics that are already present in localHeaders', () => {
      headers.value = [makeHeader('a')]
      const { availableMetrics, addableMetrics } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      availableMetrics.value = [makeMetric('a'), makeMetric('b')]
      expect(addableMetrics.value.map((m) => m.metricKey)).toEqual(['b'])
    })

    it('is empty when all available metrics are already in use', () => {
      headers.value = [makeHeader('a'), makeHeader('b')]
      const { availableMetrics, addableMetrics } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      availableMetrics.value = [makeMetric('a'), makeMetric('b')]
      expect(addableMetrics.value).toEqual([])
    })
  })

  // ── swappableMetrics computed ─────────────────────────────────────────────

  describe('swappableMetrics', () => {
    it('excludes the currently-active column and other used columns', () => {
      headers.value = [makeHeader('a'), makeHeader('b')]
      const { availableMetrics, activeHeaderKey, swappableMetrics } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      availableMetrics.value = [makeMetric('a'), makeMetric('b'), makeMetric('c')]
      activeHeaderKey.value = 'a'
      // 'a' is the active slot (excluded by metricKey !== activeHeaderKey)
      // 'b' is used by another column (excluded by usedByOtherColumns)
      // 'c' is free → swappable
      expect(swappableMetrics.value.map((m) => m.metricKey)).toEqual(['c'])
    })

    it('returns all metrics except the active one when no other columns exist', () => {
      headers.value = [makeHeader('a')]
      const { availableMetrics, activeHeaderKey, swappableMetrics } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      availableMetrics.value = [makeMetric('a'), makeMetric('b'), makeMetric('c')]
      activeHeaderKey.value = 'a'
      expect(swappableMetrics.value.map((m) => m.metricKey)).toContain('b')
      expect(swappableMetrics.value.map((m) => m.metricKey)).toContain('c')
      expect(swappableMetrics.value.map((m) => m.metricKey)).not.toContain('a')
    })
  })

  // ── fetchAvailableMetrics caching ─────────────────────────────────────────

  describe('fetchAvailableMetrics', () => {
    it('calls the /contracts endpoint once and caches the result', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { metrics: [makeMetric('temperature')] }) as unknown as Response,
      )
      const cm = useColumnManager(headers, selectedBuildingId, onSaved)

      // Trigger fetch by enabling edit mode twice
      cm.isEditMode.value = true
      await flushPromises()
      cm.isEditMode.value = false
      cm.isEditMode.value = true
      await flushPromises()

      // makeRequest should only have been called once for /contracts
      const contractsCalls = vi.mocked(makeRequest).mock.calls.filter(([url]) =>
        (url as string).includes('/contracts') && !(url as string).includes('preferences'),
      )
      expect(contractsCalls.length).toBe(1)
    })

    it('populates availableMetrics from the response', async () => {
      vi.mocked(makeRequest).mockResolvedValue(
        makeResponse(true, { metrics: [makeMetric('temperature'), makeMetric('airQuality')] }) as unknown as Response,
      )
      const { availableMetrics, isEditMode } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      isEditMode.value = true
      await flushPromises()

      expect(availableMetrics.value.map((m) => m.metricKey)).toContain('temperature')
      expect(availableMetrics.value.map((m) => m.metricKey)).toContain('airQuality')
    })
  })

  // ── savePreferences ───────────────────────────────────────────────────────

  describe('savePreferences', () => {
    it('POSTs the current localHeaders as allowed_columns', async () => {
      headers.value = [makeHeader('roomName', 'room'), makeHeader('temperature', 'temp')]
      selectedBuildingId.value = 'bldg-1'
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const { localHeaders, savePreferences } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      await flushPromises() // let the immediate selectedBuildingId watch settle

      await savePreferences()

      const postCall = vi.mocked(makeRequest).mock.calls.find(
        ([, method]) => method === 'POST',
      )
      expect(postCall).toBeDefined()
      const body = JSON.parse((postCall![2] as any).body)
      expect(body.allowed_columns).toContain('roomName')
    })

    it('calls the onSaved callback with the current headers', async () => {
      headers.value = [makeHeader('roomName', 'room')]
      selectedBuildingId.value = 'bldg-1'
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const { savePreferences } = useColumnManager(headers, selectedBuildingId, onSaved)
      await flushPromises()
      await savePreferences()

      expect(onSaved).toHaveBeenCalledOnce()
    })

    it('sets isEditMode to false after saving', async () => {
      selectedBuildingId.value = 'bldg-1'
      vi.mocked(makeRequest).mockResolvedValue(makeResponse(true) as unknown as Response)

      const { isEditMode, savePreferences } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      isEditMode.value = true
      await flushPromises()
      await savePreferences()

      expect(isEditMode.value).toBe(false)
    })
  })

  // ── closeAllPanels ────────────────────────────────────────────────────────

  describe('closeAllPanels', () => {
    it('clears activeHeaderKey and hides the add panel', () => {
      const { activeHeaderKey, showAddPanel, closeAllPanels } = useColumnManager(
        headers, selectedBuildingId, onSaved,
      )
      activeHeaderKey.value = 'roomName'
      showAddPanel.value = true
      closeAllPanels()
      expect(activeHeaderKey.value).toBeNull()
      expect(showAddPanel.value).toBe(false)
    })
  })
})

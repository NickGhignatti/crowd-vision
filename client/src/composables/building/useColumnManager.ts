import { ref, computed, watch, type Ref } from 'vue'
import { makeRequest } from '@/composables/core/useApi.ts'
import type { TableHeader } from '@/models/table.ts'
import type { MetricContract } from '@/models/table.ts'
import {
  headerId,
  headerFromMetric,
  enrichHeader,
  metricKeyToHeader,
} from '@/utils/metrics.ts'

export function useColumnManager(
  headers: Ref<TableHeader[]>,
  selectedBuildingId: Ref<string | undefined>,
  onSaved: (headers: TableHeader[]) => void,
) {
  const localHeaders = ref<TableHeader[]>(headers.value.map(enrichHeader))

  watch(headers, (incoming) => {
    if (!isEditMode.value) localHeaders.value = incoming.map(enrichHeader)
  }, { deep: true })

  const isEditMode = ref(false)
  const isSavingPreferences = ref(false)
  const availableMetrics = ref<MetricContract[]>([])
  const isFetchingMetrics = ref(false)

  const fetchAvailableMetrics = async () => {
    if (availableMetrics.value.length > 0) return
    isFetchingMetrics.value = true
    try {
      const res = await makeRequest('/contracts')
      if (res.ok) {
        const data = await res.json()
        availableMetrics.value = data.metrics ?? []
      }
    } catch (e) {
      console.error('[useColumnManager] Failed to fetch metrics catalog:', e)
    } finally {
      isFetchingMetrics.value = false
    }
  }

  watch(isEditMode, async (active) => {
    if (active) await fetchAvailableMetrics()
    else closeAllPanels()
  })

  watch(selectedBuildingId, async (buildingId) => {
    if (!buildingId) return
    try {
      const res = await makeRequest(`/contracts/preferences/${buildingId}`)
      if (res.ok) {
        const data = await res.json()
        const cols: string[] = data.allowed_columns ?? []
        if (cols.length > 0) {
          localHeaders.value = cols.map(metricKeyToHeader)
          return
        }
      }
    } catch (e) {
      console.error('[useColumnManager] Failed to fetch building preferences:', e)
    }
    // Fallback: keep whatever the parent prop provides
    localHeaders.value = headers.value.map(enrichHeader)
  }, { immediate: true })

  const activeHeaderKey = ref<string | null>(null)
  const dropdownPos = ref({ top: 0, left: 0 })
  const showAddPanel = ref(false)

  const closeAllPanels = () => {
    activeHeaderKey.value = null
    showAddPanel.value = false
  }

  const handleColumnClick = (header: TableHeader, event: MouseEvent) => {
    if (!isEditMode.value) return
    showAddPanel.value = false

    const id = headerId(header)
    if (activeHeaderKey.value === id) { activeHeaderKey.value = null; return }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    dropdownPos.value = {
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 276),
    }
    activeHeaderKey.value = id
  }

  const handleDeleteColumn = (header: TableHeader) => {
    const id = headerId(header)
    localHeaders.value = localHeaders.value.filter(h => headerId(h) !== id)
    if (activeHeaderKey.value === id) activeHeaderKey.value = null
  }

  const handleSwapColumn = (metric: MetricContract) => {
    if (!activeHeaderKey.value) return
    const alreadyUsed = localHeaders.value.some(
      h => headerId(h) === metric.metricKey && headerId(h) !== activeHeaderKey.value,
    )
    if (alreadyUsed) return
    const idx = localHeaders.value.findIndex(h => headerId(h) === activeHeaderKey.value)
    if (idx !== -1) {
      localHeaders.value[idx] = headerFromMetric(metric, localHeaders.value[idx]?.cellClass)
    }
    activeHeaderKey.value = null
  }

  const handleAddColumn = (metric: MetricContract) => {
    if (localHeaders.value.some(h => headerId(h) === metric.metricKey)) return
    localHeaders.value.push(headerFromMetric(metric))
    showAddPanel.value = false
  }

  const handleAddNew = () => {
    showAddPanel.value = !showAddPanel.value
    activeHeaderKey.value = null
  }

  const handleReorderColumns = (from: number, to: number) => {
    const reordered = [...localHeaders.value]
    const [moved] = reordered.splice(from, 1) as [TableHeader]
    reordered.splice(to, 0, moved)
    localHeaders.value = reordered
  }

  const savePreferences = async () => {
    isSavingPreferences.value = true
    try {
      if (selectedBuildingId.value) {
        const allowedColumns = localHeaders.value.map(h => h.metricKey ?? h.key)
        await makeRequest(`/contracts/preferences/${selectedBuildingId.value}`, 'POST', {
          body: JSON.stringify({ allowed_columns: allowedColumns }),
        })
      }
      onSaved([...localHeaders.value])
      isEditMode.value = false
    } catch (e) {
      console.error('[useColumnManager] Failed to save column preferences:', e)
    } finally {
      isSavingPreferences.value = false
    }
  }

  const cancelEdit = async () => {
    isEditMode.value = false
    if (selectedBuildingId.value) {
      try {
        const res = await makeRequest(`/contracts/preferences/${selectedBuildingId.value}`)
        if (res.ok) {
          const data = await res.json()
          const cols: string[] = data.allowed_columns ?? []
          if (cols.length > 0) {
            localHeaders.value = cols.map(metricKeyToHeader)
            return
          }
        }
      } catch { /* ignore */ }
    }
    localHeaders.value = headers.value.map(enrichHeader)
  }

  const addableMetrics = computed(() =>
    availableMetrics.value.filter(
      m => !localHeaders.value.some(h => headerId(h) === m.metricKey),
    ),
  )

  const swappableMetrics = computed(() => {
    const usedByOtherColumns = new Set(
      localHeaders.value
        .filter(h => headerId(h) !== activeHeaderKey.value)
        .map(h => headerId(h)),
    )
    return availableMetrics.value.filter(
      m => m.metricKey !== activeHeaderKey.value && !usedByOtherColumns.has(m.metricKey),
    )
  })

  const activeHeader = computed(
    () => localHeaders.value.find(h => headerId(h) === activeHeaderKey.value) ?? null,
  )

  return {
    localHeaders,
    isEditMode,
    isSavingPreferences,
    availableMetrics,
    isFetchingMetrics,
    activeHeaderKey,
    dropdownPos,
    showAddPanel,
    addableMetrics,
    swappableMetrics,
    activeHeader,
    handleColumnClick,
    handleDeleteColumn,
    handleSwapColumn,
    handleAddColumn,
    handleAddNew,
    handleReorderColumns,
    closeAllPanels,
    savePreferences,
    cancelEdit,
  }
}

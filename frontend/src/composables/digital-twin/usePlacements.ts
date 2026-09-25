import { ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

import { makeRequest } from '@/composables/commons/useApi.ts'
import type { Placement } from '@/types/digital-twin/sensor.ts'
import type { PlacementBatch } from '@/utils/digital-twin/sensorDraft.ts'

// fetch has no timeout of its own, so a hung edge would leave a save spinning forever.
const REQUEST_TIMEOUT_MS = 10_000

export function usePlacements(buildingId: Ref<string | undefined>) {
  const placements = shallowRef<Placement[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const refresh = async (): Promise<void> => {
    if (!buildingId.value) {
      placements.value = []
      return
    }

    isLoading.value = true
    error.value = null
    try {
      const response = await makeRequest(`/twin/building/${buildingId.value}/placements`, 'GET', {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error('Failed to load placements')

      placements.value = await response.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load placements'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /** Replaying the same batch is safe, so a caller may retry this on its own. */
  const save = async (batch: PlacementBatch): Promise<void> => {
    if (!buildingId.value || (batch.upsert.length === 0 && batch.delete.length === 0)) return

    const response = await makeRequest(`/twin/building/${buildingId.value}/placements`, 'PUT', {
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error('Failed to save placements')
  }

  watch(buildingId, () => void refresh().catch(() => {}), { immediate: true })

  return { placements, isLoading, error, refresh, save }
}

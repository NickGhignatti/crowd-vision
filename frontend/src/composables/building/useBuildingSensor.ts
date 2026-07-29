import { shallowRef, computed, watch, type Ref } from 'vue'
import { useSensorDataStore, type SensorType, type SensorBucket } from '@/stores/sensorData.ts'
import type { ApiDataPoint } from './useSensorData.ts'

/**
 * Subscribes a component to one building's sensor metric, backed by the shared
 * {@link useSensorDataStore}. Drop-in replacement for the old per-call
 * `getBuildingData`: same `{ data, isLoading, error }` shape, but many callers
 * for the same (type, building) now share a single fetch + socket subscription
 * + telemetry handler. Acquires on mount / building change and releases on the
 * matching teardown, so the store can reference-count the underlying bucket.
 */
export function useBuildingSensor(
  buildingId: Ref<string | undefined>,
  type: SensorType,
): { data: Ref<ApiDataPoint[]>; isLoading: Ref<boolean>; error: Ref<string | null> } {
  const store = useSensorDataStore()
  const bucket = shallowRef<SensorBucket | null>(null)

  watch(
    buildingId,
    (id, _old, onCleanup) => {
      if (!id) {
        bucket.value = null
        return
      }
      bucket.value = store.acquire(id, type)
      onCleanup(() => store.release(id, type))
    },
    { immediate: true },
  )

  return {
    data: computed<ApiDataPoint[]>(() => bucket.value?.data.value ?? []),
    isLoading: computed(() => bucket.value?.isLoading.value ?? false),
    error: computed(() => bucket.value?.error.value ?? null),
  }
}

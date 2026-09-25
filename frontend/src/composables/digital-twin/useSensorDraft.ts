import { computed, ref } from 'vue'
import type { Ref } from 'vue'

import { usePlacements } from './usePlacements.ts'
import { SensorBatchRejected, useSensors } from './useSensors.ts'
import type { RejectedItem } from './useSensors.ts'
import type { Coordinates } from '@/types/digital-twin/building.ts'
import type { Sensor } from '@/types/digital-twin/sensor.ts'
import {
  addSensor,
  changeCount,
  emptyDraft,
  mergePlacementBatches,
  moveSensor,
  removeSensor,
  renameSensor,
  toPlacementBatch,
  toTelemetryBatch,
} from '@/utils/digital-twin/sensorDraft.ts'
import type {
  NewSensorDraft,
  PlacementBatch,
  SensorDraft,
} from '@/utils/digital-twin/sensorDraft.ts'

type Target = Sensor | { ref: string }

export function useSensorDraft(buildingId: Ref<string | undefined>) {
  const sensorList = useSensors(buildingId)
  const placementList = usePlacements(buildingId)

  const draft = ref<SensorDraft>(emptyDraft())
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)
  const rejections = ref<RejectedItem[]>([])

  // Placements telemetry already accepted sensors for, but twin has not stored yet. Kept apart
  // from the draft so a retry never creates the same sensor twice or deletes an id already gone.
  const unsentPlacements = ref<PlacementBatch>({ upsert: [], delete: [] })
  const hasUnsentPlacements = computed(
    () => unsentPlacements.value.upsert.length > 0 || unsentPlacements.value.delete.length > 0,
  )

  const changes = computed(() => changeCount(draft.value))
  const hasChanges = computed(() => changes.value > 0 || hasUnsentPlacements.value)

  const add = (sensor: NewSensorDraft) => {
    draft.value = addSensor(draft.value, sensor)
  }
  const rename = (target: Target, name: string) => {
    draft.value = renameSensor(draft.value, target, name)
  }
  const move = (target: Target, to: { roomId: string | null; position: Coordinates | null }) => {
    draft.value = moveSensor(draft.value, target, to)
  }
  const remove = (target: Target) => {
    draft.value = removeSensor(draft.value, target)
  }

  const discard = () => {
    draft.value = emptyDraft()
    unsentPlacements.value = { upsert: [], delete: [] }
    saveError.value = null
    rejections.value = []
  }

  /**
   * Telemetry first, because it generates the ids twin keys placements by. A failure between
   * the two leaves sensors saved but unplaced, and calling `save` again sends only what is left.
   */
  const save = async (): Promise<boolean> => {
    if (!hasChanges.value || isSaving.value) return true

    isSaving.value = true
    saveError.value = null
    rejections.value = []
    try {
      const registeredIds = await sensorList.save(toTelemetryBatch(draft.value))
      unsentPlacements.value = mergePlacementBatches(
        unsentPlacements.value,
        toPlacementBatch(draft.value, registeredIds),
      )
      draft.value = emptyDraft()

      await placementList.save(unsentPlacements.value)
      unsentPlacements.value = { upsert: [], delete: [] }
      await Promise.all([sensorList.refresh(), placementList.refresh()])
      return true
    } catch (err) {
      if (err instanceof SensorBatchRejected) rejections.value = err.items
      saveError.value = err instanceof Error ? err.message : 'Failed to save sensors'
      return false
    } finally {
      isSaving.value = false
    }
  }

  return {
    sensors: sensorList.sensors,
    placements: placementList.placements,
    draft,
    changes,
    hasChanges,
    isSaving,
    saveError,
    rejections,
    add,
    rename,
    move,
    remove,
    discard,
    save,
  }
}

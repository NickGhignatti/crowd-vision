import { computed, inject, provide, ref, watch } from 'vue'
import type { InjectionKey, Ref } from 'vue'

import { useSensorDraft } from './useSensorDraft.ts'
import { useUserPermissions } from '@/composables/authentication/useUserPermissions.ts'
import { previewSensors } from '@/utils/digital-twin/sensorDraft.ts'
import { joinSensorsWithPlacements } from '@/utils/digital-twin/sensors.ts'
import type { Building } from '@/types/digital-twin/building.ts'

export type SensorEditor = ReturnType<typeof createSensorEditor>

const SensorEditorKey: InjectionKey<SensorEditor> = Symbol('sensor-editor')

function createSensorEditor(building: Ref<Building | null>) {
  const { canEdit } = useUserPermissions()
  const buildingId = computed(() => building.value?.id)
  const draft = useSensorDraft(buildingId)

  const isEditing = ref(false)
  /** Every sensor as the editor shows it: saved state with the unsaved draft applied. */
  const rows = computed(() =>
    previewSensors(
      joinSensorsWithPlacements(draft.sensors.value, draft.placements.value),
      draft.draft.value,
    ),
  )
  const userCanEdit = computed(() => (building.value ? canEdit(building.value.domains) : false))

  // A draft names one building's rooms and sensors; carried to another building it would be wrong.
  watch(buildingId, () => {
    draft.discard()
    isEditing.value = false
  })

  /** Leaving edit mode drops the draft, so it only happens once the user agrees to lose it. */
  const setEditing = (on: boolean, confirmDiscard: () => boolean): void => {
    if (!on && draft.hasChanges.value && !confirmDiscard()) return
    if (!on) draft.discard()
    isEditing.value = on
  }

  return { ...draft, rows, isEditing, userCanEdit, setEditing }
}

/** Creates the editor for one twin view and shares it with the scene, toolbar and sidebars. */
export function provideSensorEditor(building: Ref<Building | null>): SensorEditor {
  const editor = createSensorEditor(building)
  provide(SensorEditorKey, editor)
  return editor
}

export function useSensorEditor(): SensorEditor {
  const editor = inject(SensorEditorKey)
  if (!editor) throw new Error('useSensorEditor() needs provideSensorEditor() in an ancestor')
  return editor
}

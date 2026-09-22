import { computed, inject, provide, ref, watch } from 'vue'
import type { InjectionKey, Ref } from 'vue'

import { useSensorDraft } from './useSensorDraft.ts'
import { useUserPermissions } from '@/composables/authentication/useUserPermissions.ts'
import { draftRef, previewSensors } from '@/utils/digital-twin/sensorDraft.ts'
import type { SensorRow } from '@/utils/digital-twin/sensorDraft.ts'
import { clampToGround, joinSensorsWithPlacements, roomAt } from '@/utils/digital-twin/sensors.ts'
import type { Building, Coordinates, Room } from '@/types/digital-twin/building.ts'

export type SensorEditor = ReturnType<typeof createSensorEditor>

const SensorEditorKey: InjectionKey<SensorEditor> = Symbol('sensor-editor')

function createSensorEditor(building: Ref<Building | null>, visibleRooms: Ref<Room[]>) {
  const { canEdit } = useUserPermissions()
  const buildingId = computed(() => building.value?.id)
  const draft = useSensorDraft(buildingId)

  const isEditing = ref(false)
  const isAddPanelOpen = ref(false)
  /** Device kinds switched off in the legend; every other kind shows. */
  const hiddenTypes = ref<Set<string>>(new Set())

  /** Clicking a chip switches that kind off, and clicking it again switches it back on. */
  const toggleType = (kind: string) => {
    const hidden = new Set(hiddenTypes.value)
    if (!hidden.delete(kind)) hidden.add(kind)
    hiddenTypes.value = hidden
  }
  /**
   * A sensor waiting for the user to click where it sits: a new one (name and type only), or an
   * existing one being moved (`moving` holds its row).
   */
  const pendingPlacement = ref<{
    name: string
    sensorType: string
    moving?: SensorRow
  } | null>(null)

  /** The point picked for the waiting sensor, adjustable until the user confirms it. */
  const candidate = ref<{ position: Coordinates; roomId: string | null } | null>(null)

  /** Keeps a kind visible, so a sensor never disappears into a filter the moment it is placed. */
  const revealType = (kind: string) => {
    if (hiddenTypes.value.has(kind)) toggleType(kind)
  }

  /** Adding from a room sidebar goes through here too, for the same reason. */
  const add: typeof draft.add = (sensor) => {
    revealType(sensor.sensorType)
    draft.add(sensor)
  }

  const startPlacing = (sensor: { name: string; sensorType: string }) => {
    pendingPlacement.value = sensor
    revealType(sensor.sensorType)
    isAddPanelOpen.value = false
  }
  const startMoving = (row: SensorRow) => {
    pendingPlacement.value = { name: row.name, sensorType: row.sensorType, moving: row }
    revealType(row.sensorType)
    candidate.value = row.position ? { position: row.position, roomId: row.roomId } : null
    isAddPanelOpen.value = false
  }

  const cancelPlacing = () => {
    pendingPlacement.value = null
    candidate.value = null
  }
  /** A click in the scene: the surface it hit decides the room. */
  const pick = (position: Coordinates, roomId: string | null) => {
    candidate.value = { position, roomId }
  }
  /** Typed or nudged coordinates have no surface behind them, so the room comes from the point. */
  const moveCandidate = (position: Coordinates) => {
    const grounded = clampToGround(position, building.value?.rooms ?? [])
    candidate.value = { position: grounded, roomId: roomAt(grounded, visibleRooms.value) }
  }
  const confirmPlacement = () => {
    const pending = pendingPlacement.value
    if (!pending || !candidate.value) return
    if (pending.moving) {
      draft.move(pending.moving.target, candidate.value)
    } else {
      draft.add({
        ref: draftRef(),
        name: pending.name,
        sensorType: pending.sensorType,
        ...candidate.value,
      })
    }
    cancelPlacing()
  }
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
    hiddenTypes.value = new Set()
  })

  // Leaving edit mode by any route also abandons a half-started add.
  watch(isEditing, (on) => {
    if (on) return
    isAddPanelOpen.value = false
    cancelPlacing()
  })

  /** Leaving edit mode drops the draft, so it only happens once the user agrees to lose it. */
  const setEditing = (on: boolean, confirmDiscard: () => boolean): void => {
    if (!on && draft.hasChanges.value && !confirmDiscard()) return
    if (!on) draft.discard()
    isEditing.value = on
  }

  return {
    ...draft,
    add,
    rows,
    isEditing,
    userCanEdit,
    setEditing,
    isAddPanelOpen,
    hiddenTypes,
    toggleType,
    pendingPlacement,
    startPlacing,
    startMoving,
    cancelPlacing,
    candidate,
    pick,
    moveCandidate,
    confirmPlacement,
  }
}

/** Creates the editor for one twin view and shares it with the scene, toolbar and sidebars. */
export function provideSensorEditor(
  building: Ref<Building | null>,
  visibleRooms: Ref<Room[]>,
): SensorEditor {
  const editor = createSensorEditor(building, visibleRooms)
  provide(SensorEditorKey, editor)
  return editor
}

export function useSensorEditor(): SensorEditor {
  const editor = inject(SensorEditorKey)
  if (!editor) throw new Error('useSensorEditor() needs provideSensorEditor() in an ancestor')
  return editor
}

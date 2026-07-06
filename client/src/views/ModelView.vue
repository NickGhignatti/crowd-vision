<script setup lang="ts">
import NavBar from '@/components/layouts/NavBar.vue'
import AutoRotate from '@/components/layouts/AutoRotate.vue'
import BuildingsSelector from '@/components/selectors/BuildingsSelector.vue'
import RoomsSelector from '@/components/selectors/RoomsSelector.vue'
import ViewControls from '@/components/panels/ControlPanel.vue'
import EditToolbar from '@/components/panels/EditToolbar.vue'
import RoomInspector from '@/components/panels/RoomInspector.vue'
import EditGuides from '@/components/scene/EditGuides.vue'
import FloorPlanEditor from '@/components/scene/FloorPlanEditor.vue'
import { useBuildingModel } from '@/composables/building/useBuildingModel.ts'
import { useSceneControls } from '@/composables/scene/useSceneControls.ts'
import { useModelEditor } from '@/composables/scene/useModelEditor.ts'
import {
  boxesAreAdjacent,
  boxesOverlap,
  findFreeSpot,
  floorLevels,
  snapToNeighbors,
  type SnapGuide,
} from '@/composables/scene/editorGeometry.ts'
import type { HandleResizeResult } from '@/composables/scene/floorPlanGeometry.ts'
import { useUserPermissions } from '@/composables/auth/useUserPermissions.ts'
import {
  useBuildingAirQualitySensors,
  useBuildingTemperature,
} from '@/composables/building/useRoomsData.ts'
import type { Room } from '@/models/building.ts'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, watchEffect } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { TresCanvas } from '@tresjs/core'
import { Color, Matrix4, NoToneMapping, type Intersection, type InstancedMesh, type Group } from 'three'
import { OrbitControls, TransformControls } from '@tresjs/cientos'
import { roomColorOverlapWarning, roomColorStandard, roomOpacity } from '@/helpers/colors.ts'
import { useModes } from '@/composables/scene/useModes.ts'
import {
  applyRoomColors,
  applyRoomMatrices,
  useInstancedRooms,
} from '@/composables/scene/useInstancedRooms.ts'
import {
  createWebGPURenderer,
  isWebGPUSupported,
  SCENE_CLEAR_COLOR,
} from '@/composables/scene/useWebGPURenderer.ts'
import { selectRenderMode } from '@/composables/scene/useRenderMode.ts'
import RenderInvalidator from '@/components/scene/RenderInvalidator.vue'

interface TresEvent extends Intersection {
  stopPropagation: () => void
}

const buildingModel = useBuildingModel()
const editor = useModelEditor()
const { canEdit } = useUserPermissions()
const { t } = useI18n()

const {
  cameraRef,
  controlsRef,
  isRotating,
  resetView,
  zoomIn,
  zoomOut,
  togglePanorama,
  triggerExplodeView,
} = useSceneControls()

const modes = useModes()

const canEditCurrentBuilding = computed(() => canEdit(buildingModel.building.value?.domains ?? []))

// RoomsSelector's own reopen button occupies the same top-right corner once
// it's collapsed (CollapsiblePanel positions it independently of layout flow)
// — EditToolbar shifts itself left to clear it when this is false.
const isRightPanelOpen = ref(true)

// The 2D plan is only ever meaningful mid-edit-session — reset to 3D whenever
// editing ends so a later Edit re-entry doesn't start on a stale view.
const viewMode = ref<'3d' | 'plan'>('3d')
watch(
  () => editor.isEditing.value,
  (isEditing) => {
    if (!isEditing) viewMode.value = '3d'
  },
)
const handleSetViewMode = (mode: '3d' | 'plan') => {
  viewMode.value = mode
}

// Bumped whenever a repaint is needed (on-demand render mode won't draw otherwise);
// read by RenderInvalidator, which is the only place `invalidate()` is legal to call.
const frameRequestTick = ref(0)
const requestFrame = () => {
  frameRequestTick.value++
}

// NOT `|| editor.isEditing.value` — see the git history / memory note on this
// line. Forcing 'always' mode for the whole edit session froze the canvas
// whenever the on-demand frame counter had already idled to 0 at the moment
// editing began: TresJS's internal render-loop only checks whether it's in
// 'always' mode from *inside* a render that's already happening, so
// switching modes while the counter is at 0 never kicks anything off, and
// invalidate() (which is what requestFrame() below calls into) is a no-op
// outside 'on-demand' mode — a permanent, silent deadlock. Every editing
// interaction below already calls requestFrame() explicitly on every
// meaningful change, so plain on-demand mode is sufficient.
const renderMode = computed(() => selectRenderMode(isRotating.value))

const handleEnterEdit = () => {
  if (!buildingModel.building.value) return
  editor.beginEdit(buildingModel.building.value)
  requestFrame()
}

const handleCancelEdit = () => {
  editor.cancel()
  requestFrame()
}

// Inline feedback, not a toast — the app has no toast system (see
// DomainsTable.vue's actionError for the same convention). Success clears
// itself so it doesn't linger; failure stays until the next Save attempt so
// the admin has time to notice and retry (the draft itself is never lost on
// a failed save — editor.save() only swaps the baseline on success).
const saveFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)
let saveFeedbackTimeout: ReturnType<typeof setTimeout> | undefined

const handleSaveEdit = async () => {
  clearTimeout(saveFeedbackTimeout)
  saveFeedback.value = null
  try {
    await editor.save()
    saveFeedback.value = { type: 'success', message: t('model.editor.saveSuccess') }
    saveFeedbackTimeout = setTimeout(() => {
      saveFeedback.value = null
    }, 4000)
  } catch (err) {
    console.error('Failed to save room layout:', err)
    saveFeedback.value = { type: 'error', message: t('model.editor.saveFailed') }
  }
  requestFrame()
}

// The rooms actually rendered: the live building's floor-filtered rooms in
// view mode, or the edit session's draft (same floor filter, no explode —
// exploding mid-edit isn't a designed interaction) while editing.
const roomsForScene = computed(() => {
  if (!editor.isEditing.value || !editor.draft.value) return buildingModel.visibleRooms.value
  const floor = buildingModel.selectedFloor.value
  const rooms = editor.draft.value.rooms
  return floor === null ? rooms : rooms.filter((r) => r.position.y === floor)
})

// No automatic WebGL fallback from TresJS if the custom renderer factory is
// wired in on an unsupported browser, so only pass it when the API exists.
const rendererFactory = isWebGPUSupported() ? createWebGPURenderer : undefined

const currentBuildingId = computed(() => buildingModel.building.value?.id)
const { temperatures: roomTemperatures } = useBuildingTemperature(currentBuildingId)
const { indoorAqi: roomIndoorAqi } = useBuildingAirQualitySensors(currentBuildingId)

// Guardrail, not a wall (plan §1.1.6): flags rooms whose boxes overlap on the
// current floor while editing so the tint below can warn without ever
// blocking Save. O(n²) over one floor's room count, only while editing —
// nowhere near the telemetry hot path.
const overlappingRoomIds = computed<Set<string>>(() => {
  if (!editor.isEditing.value) return new Set()
  const rooms = roomsForScene.value
  const overlapping = new Set<string>()
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (boxesOverlap(rooms[i]!, rooms[j]!)) {
        overlapping.add(rooms[i]!.id)
        overlapping.add(rooms[j]!.id)
      }
    }
  }
  return overlapping
})

const roomColors = shallowRef<Record<string, string>>({})
watchEffect(() => {
  const prev = roomColors.value
  const out: Record<string, string> = {}
  let changed = false
  for (const room of roomsForScene.value) {
    // Telemetry recoloring pauses during editing — a flat standard color keeps
    // the geometry-editing view uncluttered and avoids reacting to live data
    // for a room whose position doesn't match the server yet. An overlapping
    // room gets a warning tint instead, on top of that.
    const c = editor.isEditing.value
      ? overlappingRoomIds.value.has(room.id)
        ? roomColorOverlapWarning()
        : roomColorStandard()
      : modes.getColorByMode({
          temperature: roomTemperatures.value[room.id],
          indoorAqi: roomIndoorAqi.value[room.id],
        })
    out[room.id] = c
    if (prev[room.id] !== c) changed = true
  }
  // swap if any band changed or the room set changed size
  if (!changed && Object.keys(prev).length === Object.keys(out).length) return
  roomColors.value = out
})

// The selected room needs its own opacity and the exploded room needs its own
// render-order/edge outline, neither of which an InstancedMesh can express
// per-instance — so both are pulled out of the shared batch and rendered
// individually, same as before instancing existed. While editing, the overlay
// slot is driven by the edit session's own selection (it's also where the
// move gizmo attaches), and exploding is disabled.
const selectedRoomIdRef = computed(() =>
  editor.isEditing.value ? editor.selectedId.value : buildingModel.selectedRoomId.value,
)
const explodedRoomIdRef = computed(() =>
  editor.isEditing.value ? null : buildingModel.explodedRoomId.value,
)
const { instancedRooms, overlayRoom, roomIdByInstanceIndex } = useInstancedRooms(
  roomsForScene,
  selectedRoomIdRef,
  explodedRoomIdRef,
)
const explodedRoom = computed(() => {
  const id = buildingModel.explodedRoomId.value
  if (!id) return null
  return buildingModel.visibleRooms.value.find((room) => room.id === id) ?? null
})

const instancedMeshRef = shallowRef<InstancedMesh | null>(null)
const scratchColor = new Color()
const scratchMatrix = new Matrix4()

// Room positions/sizes are static per building+floor, so the matrix rebuild (and the
// bounding-sphere recompute it needs) only has to run when the instanced room set
// changes — not on every telemetry tick, which is what the color-only watch below is for.
watch(
  [instancedMeshRef, instancedRooms],
  ([mesh, rooms]) => {
    if (!mesh) return
    applyRoomMatrices(mesh, rooms, scratchMatrix)
    applyRoomColors(mesh, rooms, roomColors.value, scratchColor, roomColorStandard())
    requestFrame()
  },
  { immediate: true, flush: 'post' },
)

// Imperative buffer writes, not reactive props: matches the "mutate existing
// objects, don't rebuild the scene" rule for the telemetry-driven color path.
watch(
  [instancedMeshRef, roomColors],
  ([mesh]) => {
    if (!mesh) return
    applyRoomColors(mesh, instancedRooms.value, roomColors.value, scratchColor, roomColorStandard())
    requestFrame()
  },
  { immediate: true, flush: 'post' },
)

const handleExplodeToggle = () => {
  const result = triggerExplodeView(
    buildingModel.selectedRoomId.value,
    buildingModel.building.value,
    buildingModel.isExploded.value,
  )
  buildingModel.isExploded.value = result.exploded
  buildingModel.explodedRoomId.value = result.roomId
  requestFrame()
}

// While a merge is pending (see handleToggleMerge), the next room click
// completes the merge instead of just selecting — shared by both the 3D
// scene's onRoomClick and the 2D plan's handlePlanSelect.
const handleMergeTargetClick = (targetId: string) => {
  const sourceId = editor.mergeCandidateId.value
  if (!sourceId || sourceId === targetId) return
  const rooms = editor.draft.value?.rooms ?? []
  const a = rooms.find((r) => r.id === sourceId)
  const b = rooms.find((r) => r.id === targetId)
  if (!a || !b) return

  if (!boxesAreAdjacent(a, b) && !window.confirm(t('model.editor.mergeNotAdjacent'))) {
    editor.cancelMerge()
    requestFrame()
    return
  }

  editor.beginGesture()
  editor.mergeRooms(sourceId, targetId)
  editor.cancelMerge()
  requestFrame()
}

const onRoomClick = (event: TresEvent) => {
  if (isRotating.value) return
  event?.stopPropagation?.()
  const id =
    event.instanceId !== undefined
      ? roomIdByInstanceIndex.value[event.instanceId]
      : (event.object?.userData as { roomId?: string })?.roomId
  if (id) {
    if (editor.isEditing.value) {
      if (editor.mergeCandidateId.value) {
        handleMergeTargetClick(id)
      } else {
        editor.select(editor.selectedId.value === id ? null : id)
      }
    } else {
      buildingModel.toggleRoom(id)
    }
  }
  requestFrame()
}

// The gizmo attaches to this group (not the mesh inside it), because the
// group's position/scale *is* the room's absolute center/size — TransformControls
// writes back into whatever object it's given, in that object's own transform space.
const overlayGroupRef = shallowRef<Group | null>(null)
const isGizmoDragging = ref(false)
const dimensionsAtGestureStart = shallowRef<{ width: number; height: number; depth: number } | null>(
  null,
)
const SCALE_EPSILON = 0.001

// Tracked globally (not per-drag) so the free-move modifier is already known
// the instant a drag starts, not one keystroke late.
const isSnapBypassed = ref(false)
const activeGuides = ref<SnapGuide[]>([])

// Switches the viewed floor to `newY`. Only ever called on a *discrete*,
// one-shot action (an inspector "move to floor" commit) — NEVER during a live
// gizmo drag: setFloor changes `selectedFloor`, which is baked into the
// instanced mesh's :key, so calling it 60x/second mid-drag would destroy and
// recreate the mesh out from under TransformControls and crash the renderer.
const followRoomToFloor = (newY: number) => {
  if (buildingModel.selectedFloor.value !== null) {
    buildingModel.setFloor(newY)
  }
}

// Shared by the 3D move gizmo and the 2D plan's drag-to-move: floor-plane only
// (X/Z), Y never changes here — a room's floor is a discrete plan you assign
// via the inspector, not something you drag continuously (that both confused
// users and crashed the renderer). Smart-guide (neighbor) snapping takes
// priority over the plain grid, so only an axis neighbor-snapping *didn't*
// resolve falls back to grid-snap.
const applySnappedMove = (roomId: string, rawX: number, rawZ: number) => {
  if (isSnapBypassed.value) {
    editor.moveRoom(roomId, { x: rawX, z: rawZ }, { snapX: false, snapZ: false })
    activeGuides.value = []
    requestFrame()
    return
  }

  const room = editor.draft.value?.rooms.find((r) => r.id === roomId)
  if (!room) return

  const candidate = { ...room, position: { ...room.position, x: rawX, z: rawZ } }
  const snapResult = snapToNeighbors(candidate, editor.draft.value?.rooms ?? [])
  const snappedX = snapResult.guides.some((g) => g.axis === 'x')
  const snappedZ = snapResult.guides.some((g) => g.axis === 'z')

  editor.moveRoom(
    roomId,
    { x: snappedX ? snapResult.x : rawX, z: snappedZ ? snapResult.z : rawZ },
    { snapX: !snappedX, snapZ: !snappedZ },
  )
  activeGuides.value = snapResult.guides
  requestFrame()
}

// Move commits continuously (every drag event is a direct, idempotent position
// write). Resize does NOT: the group's `scale` and the mesh's own BoxGeometry
// args (bound to the draft's dimensions) would otherwise both apply at once,
// visibly double-sizing the box mid-drag — so resize only commits once, at
// drag end, then resets the group's scale to identity in the same tick the
// geometry args update to the final size (see onGizmoDragging below).
const onGizmoObjectChange = () => {
  if (editor.activeTool.value !== 'move') return
  if (!overlayRoom.value || !overlayGroupRef.value) return
  applySnappedMove(
    overlayRoom.value.id,
    overlayGroupRef.value.position.x,
    overlayGroupRef.value.position.z,
  )
}

const onGizmoDragging = (dragging: boolean) => {
  isGizmoDragging.value = dragging

  if (dragging) {
    editor.beginGesture()
    if (overlayRoom.value) dimensionsAtGestureStart.value = { ...overlayRoom.value.dimensions }
    return
  }

  if (
    editor.activeTool.value === 'resize' &&
    overlayRoom.value &&
    overlayGroupRef.value &&
    dimensionsAtGestureStart.value
  ) {
    const { scale } = overlayGroupRef.value
    const start = dimensionsAtGestureStart.value
    if (Math.abs(scale.x - 1) > SCALE_EPSILON)
      editor.resizeRoom(overlayRoom.value.id, 'width', start.width * scale.x, 'center')
    if (Math.abs(scale.y - 1) > SCALE_EPSILON)
      editor.resizeRoom(overlayRoom.value.id, 'height', start.height * scale.y, 'center')
    if (Math.abs(scale.z - 1) > SCALE_EPSILON)
      editor.resizeRoom(overlayRoom.value.id, 'depth', start.depth * scale.z, 'center')
    overlayGroupRef.value.scale.set(1, 1, 1)
  }

  dimensionsAtGestureStart.value = null
  activeGuides.value = []
  requestFrame()
}

const handleSetTool = (tool: 'move' | 'resize') => {
  editor.setTool(tool)
}

const handleUndo = () => {
  editor.undo()
  requestFrame()
}

const handleRedo = () => {
  editor.redo()
  requestFrame()
}

const ADD_ROOM_DEFAULT_DIMENSIONS = { width: 2, height: 2, depth: 2 }
const ADD_ROOM_GRID_STEP = 2

const handleAddRoom = () => {
  const floorY = buildingModel.selectedFloor.value ?? 0
  const position = findFreeSpot(
    editor.draft.value?.rooms ?? [],
    floorY,
    ADD_ROOM_DEFAULT_DIMENSIONS,
    ADD_ROOM_GRID_STEP,
  )
  editor.beginGesture()
  const created = editor.addRoom({ position, dimensions: ADD_ROOM_DEFAULT_DIMENSIONS })
  if (created) editor.select(created.id)
  requestFrame()
}

// A cheap "does this room have live sensor data" heuristic reusing telemetry
// already fetched for coloring — good enough for the delete confirmation
// without adding a dedicated sensor-registration lookup.
const roomHasSensorData = (roomId: string): boolean =>
  roomTemperatures.value[roomId] !== undefined || roomIndoorAqi.value[roomId] !== undefined

const handleDeleteRoom = () => {
  const id = editor.selectedId.value
  if (!id) return

  if ((editor.draft.value?.rooms.length ?? 0) <= 1) {
    window.alert(t('model.editor.deleteLastRoomBlocked'))
    return
  }
  if (roomHasSensorData(id) && !window.confirm(t('model.editor.deleteConfirmSensors'))) return

  editor.beginGesture()
  editor.deleteRoom(id)
  requestFrame()
}

const handleDuplicateRoom = () => {
  const id = editor.selectedId.value
  if (!id) return
  editor.beginGesture()
  const duplicate = editor.duplicateRoom(id)
  if (duplicate) editor.select(duplicate.id)
  requestFrame()
}

const handleToggleMerge = () => {
  if (editor.mergeCandidateId.value) {
    editor.cancelMerge()
  } else {
    editor.beginMerge()
  }
  requestFrame()
}

const handleInspectorCommit = (patch: {
  name?: string
  color?: string
  capacity?: number
  position?: Partial<{ x: number; y: number; z: number }>
  dimensions?: Partial<{ width: number; height: number; depth: number }>
}) => {
  const id = editor.selectedId.value
  if (!id) return
  editor.beginGesture()
  editor.updateRoomFields(id, patch)
  if (patch.position?.y !== undefined) followRoomToFloor(patch.position.y)
  requestFrame()
}

// The 2D plan reuses the same draft/snap/undo machinery as the 3D gizmo —
// only the input surface differs (see MODEL_EDITOR_PLAN.md Phase 4).
const handlePlanSelect = (id: string | null) => {
  if (id && editor.mergeCandidateId.value) {
    handleMergeTargetClick(id)
    return
  }
  editor.select(id)
}

const handlePlanMove = (id: string, position: { x: number; z: number }) => {
  applySnappedMove(id, position.x, position.z)
}

// Unlike the 3D gizmo, a 2D handle drag knows exactly which face was
// grabbed, so this is genuine face-anchored resize (min/max), not the
// pivot-centered approximation the 3D scale gizmo is limited to.
const handlePlanResize = (id: string, result: HandleResizeResult) => {
  if (result.width !== undefined && result.widthAnchor) {
    editor.resizeRoom(id, 'width', result.width, result.widthAnchor)
  }
  if (result.depth !== undefined && result.depthAnchor) {
    editor.resizeRoom(id, 'depth', result.depth, result.depthAnchor)
  }
  requestFrame()
}

const handlePlanAddRoom = (seed: { position: Room['position']; dimensions: Room['dimensions'] }) => {
  const created = editor.addRoom(seed)
  if (created) editor.select(created.id)
  requestFrame()
}

// Mirrors onGizmoDragging's gesture boundary: one undo step per drag/draw,
// not per pointer-move event.
const onPlanDragging = (dragging: boolean) => {
  if (dragging) {
    editor.beginGesture()
  } else {
    activeGuides.value = []
    requestFrame()
  }
}

const inspectorFloorLevels = computed(() => floorLevels(editor.draft.value?.rooms ?? []))
// Guides are only ever set for the room currently being dragged on the move
// gizmo, and Phase 1's move is floor-plane constrained (Y never changes), so
// the dragged room's own Y is always the right height to draw them at.
const activeGuidesFloorY = computed(() => overlayRoom.value?.position.y ?? 0)

// Switching the selection or tool mid-drag can't happen (the gizmo owns
// input focus while dragging), but leftover guides from a finished drag
// should not linger once the user moves on to something else.
watch(
  () => [editor.selectedId.value, editor.activeTool.value],
  () => {
    activeGuides.value = []
  },
)

const NUDGE_STEP = 0.5
const NUDGE_STEP_LARGE = 2

// Undo/redo, the Move/Resize tool switch, and arrow-key nudging only make
// sense while editing — and never while the user is typing into an inspector
// field (a plain "s" keystroke there must not switch tools mid-word).
const handleKeydown = (event: KeyboardEvent) => {
  if (!editor.isEditing.value) return

  if (event.key === 'Alt') {
    isSnapBypassed.value = true
    return
  }

  const targetTag = (event.target as HTMLElement | null)?.tagName
  if (targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA') return

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) handleRedo()
    else handleUndo()
    return
  }

  if (event.key === 'Escape') {
    if (editor.mergeCandidateId.value) {
      editor.cancelMerge()
      requestFrame()
    }
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    handleDuplicateRoom()
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    handleDeleteRoom()
    return
  }

  if (event.key.toLowerCase() === 'm') {
    handleSetTool('move')
    return
  }
  if (event.key.toLowerCase() === 's') {
    handleSetTool('resize')
    return
  }

  const room = editor.selectedRoom.value
  if (!room) return

  const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
  let dx = 0
  let dz = 0
  if (event.key === 'ArrowLeft') dx = -step
  else if (event.key === 'ArrowRight') dx = step
  else if (event.key === 'ArrowUp') dz = -step
  else if (event.key === 'ArrowDown') dz = step
  else return

  event.preventDefault()
  editor.beginGesture()
  editor.moveRoom(room.id, { x: room.position.x + dx, z: room.position.z + dz })
  requestFrame()
}

const handleKeyup = (event: KeyboardEvent) => {
  if (event.key === 'Alt') isSnapBypassed.value = false
}

// Direct camera.position mutations (unlike OrbitControls drag) don't necessarily emit
// an OrbitControls `change` event, so on-demand mode needs an explicit frame request.
const handleResetView = () => {
  resetView()
  requestFrame()
}

const handleZoomIn = () => {
  zoomIn()
  requestFrame()
}

const handleZoomOut = () => {
  zoomOut()
  requestFrame()
}

// Blocks losing unsaved room edits to an accidental navigation or tab close.
// window.confirm matches the rest of this file's existing confirm-before-
// destructive-action convention (merge-not-adjacent, delete-with-sensors).
const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!editor.dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (!editor.dirty.value) return true
  return window.confirm(t('model.editor.unsavedLeaveConfirm'))
})

onMounted(() => {
  buildingModel.fetchBuildings()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  clearTimeout(saveFeedbackTimeout)
})
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-50 overflow-hidden">
    <NavBar />

    <div class="flex flex-1 relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <BuildingsSelector
        :buildingOptions="buildingModel.availableBuildingsNames.value"
        :selectedId="buildingModel.building.value?.id || null"
        :buildingModel="buildingModel.building.value"
        :activeFloor="buildingModel.selectedFloor.value"
        @json-uploaded="buildingModel.fetchBuildings"
        @change-building="buildingModel.setBuildingById"
        @change-floor="buildingModel.setFloor"
      />

      <main class="flex-1 relative bg-slate-50 z-0 min-w-0">
        <FloorPlanEditor
          v-if="editor.isEditing.value && viewMode === 'plan'"
          :rooms="roomsForScene"
          :floor-y="buildingModel.selectedFloor.value ?? 0"
          :selected-id="editor.selectedId.value"
          @select="handlePlanSelect"
          @move="handlePlanMove"
          @resize="handlePlanResize"
          @add-room="handlePlanAddRoom"
          @dragging="onPlanDragging"
        />

        <TresCanvas
          v-else
          :clear-color="SCENE_CLEAR_COLOR"
          :tone-mapping="NoToneMapping"
          :dpr="[1, 2]"
          :render-mode="renderMode"
          window-size
          :renderer="rendererFactory"
        >
          <RenderInvalidator :trigger="frameRequestTick" />

          <TresPerspectiveCamera ref="cameraRef" :position="[10, 10, 10]" :look-at="[0, 0, 0]" />

          <OrbitControls
            ref="controlsRef"
            make-default
            :damping-factor="0.05"
            :enabled="!isRotating && !isGizmoDragging"
          />

          <TresAmbientLight :intensity="0.6" />
          <TresDirectionalLight :position="[10, 20, 10]" :intensity="0.8" />

          <AutoRotate :active="isRotating" :camera="cameraRef" />

          <template v-if="buildingModel.building.value">
            <TresInstancedMesh
              v-if="instancedRooms.length > 0"
              :key="`${currentBuildingId}:${buildingModel.selectedFloor.value}:${instancedRooms.length}`"
              ref="instancedMeshRef"
              :args="[undefined, undefined, instancedRooms.length]"
              @click="onRoomClick"
            >
              <TresBoxGeometry :args="[1, 1, 1]" />
              <TresMeshLambertMaterial
                :transparent="true"
                :opacity="roomOpacity(false)"
                :depth-write="false"
                :depth-test="true"
                :side="2"
              />
            </TresInstancedMesh>

            <TresGroup
              v-if="overlayRoom"
              ref="overlayGroupRef"
              :position="[overlayRoom.position.x, overlayRoom.position.y, overlayRoom.position.z]"
            >
              <TresMesh :user-data="{ roomId: overlayRoom.id }" @click="onRoomClick">
                <TresBoxGeometry
                  :args="[
                    overlayRoom.dimensions.width,
                    overlayRoom.dimensions.height,
                    overlayRoom.dimensions.depth,
                  ]"
                />
                <TresMeshLambertMaterial
                  :color="roomColors[overlayRoom.id]"
                  :transparent="true"
                  :opacity="roomOpacity(true)"
                  :depth-write="false"
                  :depth-test="true"
                  :side="2"
                />
              </TresMesh>
            </TresGroup>

            <TransformControls
              v-if="editor.isEditing.value && overlayRoom && overlayGroupRef"
              :object="overlayGroupRef"
              :mode="editor.activeTool.value === 'move' ? 'translate' : 'scale'"
              :show-y="editor.activeTool.value === 'resize'"
              :translation-snap="editor.activeTool.value === 'move' ? 0.5 : undefined"
              :size="0.75"
              @dragging="onGizmoDragging"
              @object-change="onGizmoObjectChange"
            />

            <EditGuides
              v-if="activeGuides.length > 0"
              :guides="activeGuides"
              :floor-y="activeGuidesFloorY"
            />

            <TresGroup
              v-if="explodedRoom"
              :position="[explodedRoom.position.x, explodedRoom.position.y, explodedRoom.position.z]"
            >
              <TresLineSegments :render-order="10">
                <TresEdgesGeometry>
                  <TresBoxGeometry
                    :args="[
                      explodedRoom.dimensions.width,
                      explodedRoom.dimensions.height,
                      explodedRoom.dimensions.depth,
                    ]"
                  />
                </TresEdgesGeometry>
                <TresLineBasicMaterial color="#475569" :line-width="2" :depth-test="true" />
              </TresLineSegments>
            </TresGroup>
          </template>
        </TresCanvas>

        <div
          v-if="saveFeedback"
          data-testid="save-feedback"
          class="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm shadow-xl"
          :class="
            saveFeedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          "
        >
          <i
            class="ph-bold text-lg"
            :class="saveFeedback.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'"
          ></i>
          <span>{{ saveFeedback.message }}</span>
          <button
            data-testid="dismiss-save-feedback"
            class="opacity-60 hover:opacity-100"
            @click="saveFeedback = null"
          >
            <i class="ph-bold ph-x"></i>
          </button>
        </div>

        <EditToolbar
          :can-edit="canEditCurrentBuilding"
          :is-editing="editor.isEditing.value"
          :dirty="editor.dirty.value"
          :is-saving="editor.isSaving.value"
          :active-tool="editor.activeTool.value"
          :can-undo="editor.canUndo.value"
          :can-redo="editor.canRedo.value"
          :view-mode="viewMode"
          :has-selection="!!editor.selectedId.value"
          :is-merge-pending="!!editor.mergeCandidateId.value"
          :right-panel-open="isRightPanelOpen"
          :current-floor="buildingModel.selectedFloor.value"
          :floor-levels="inspectorFloorLevels"
          @enter="handleEnterEdit"
          @save="handleSaveEdit"
          @cancel="handleCancelEdit"
          @set-tool="handleSetTool"
          @set-view-mode="handleSetViewMode"
          @undo="handleUndo"
          @redo="handleRedo"
          @add-room="handleAddRoom"
          @delete-room="handleDeleteRoom"
          @duplicate-room="handleDuplicateRoom"
          @toggle-merge="handleToggleMerge"
          @set-floor="buildingModel.setFloor"
        />

        <RoomInspector
          v-if="editor.isEditing.value"
          :room="editor.selectedRoom.value"
          :floor-levels="inspectorFloorLevels"
          @commit="handleInspectorCommit"
        />

        <ViewControls
          :selected-room-id="buildingModel.selectedRoomId.value"
          :is-exploded="buildingModel.isExploded.value"
          :disabled="isRotating || editor.isEditing.value"
          @reset-view="handleResetView"
          @toggle-explode="handleExplodeToggle"
          @zoom-in="handleZoomIn"
          @zoom-out="handleZoomOut"
          @toggle-panorama="togglePanorama"
        />
      </main>

      <RoomsSelector
        v-model:open="isRightPanelOpen"
        :buildingModel="buildingModel.displayedBuilding.value"
        :selectedRoomId="buildingModel.selectedRoomId.value"
        @toggle-select="buildingModel.toggleRoom"
      />
    </div>
  </div>
</template>

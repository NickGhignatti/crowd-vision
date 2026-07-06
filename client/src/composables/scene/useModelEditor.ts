import { ref, computed } from 'vue'
import type { Building, Room } from '@/models/building.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { diffRooms, mergeBoxes, snapToGrid } from '@/composables/scene/editorGeometry.ts'

// Grid step for the Phase-1 move gizmo. A separate, adjustable snap value can
// come later (Phase 3) — this keeps the MVP's dragging predictable for now.
const MOVE_GRID_STEP = 0.5
const RESIZE_GRID_STEP = 0.5
const MIN_ROOM_DIMENSION = 0.5
const MAX_HISTORY = 50

export type EditorTool = 'move' | 'resize'
export type ResizeAxis = 'width' | 'height' | 'depth'
export type ResizeAnchor = 'min' | 'max' | 'center'

const AXIS_TO_POSITION_KEY: Record<ResizeAxis, 'x' | 'y' | 'z'> = {
  width: 'x',
  height: 'y',
  depth: 'z',
}

// JSON round-trip, not structuredClone: `building` may be a Vue reactive proxy
// (when called with a ref's `.value`), and structuredClone can't clone those.
const cloneBuilding = (building: Building): Building => JSON.parse(JSON.stringify(building))
const cloneRooms = (rooms: Room[]): Room[] => JSON.parse(JSON.stringify(rooms))

/**
 * Draft-then-commit editing session for the digital twin model editor. Every
 * mutation lands on a deep-cloned `draft`, never on the live `building` — this
 * keeps telemetry coloring untouched mid-edit, makes Cancel free, and makes
 * Save a single diffed request instead of a PATCH per drag (see
 * MODEL_EDITOR_PLAN.md §2).
 */
export function useModelEditor() {
  const buildingsStore = useBuildingsStore()

  const isEditing = ref(false)
  const draft = ref<Building | null>(null)
  const original = ref<Building | null>(null)
  const selectedId = ref<string | null>(null)
  const isSaving = ref(false)
  const activeTool = ref<EditorTool>('move')
  // Set while the user is picking the second room for a merge (the toolbar's
  // Merge button arms this on the currently-selected room; the *next* room
  // click completes the merge instead of just re-selecting — see ModelView).
  const mergeCandidateId = ref<string | null>(null)

  // Undo/redo snapshots the whole rooms array once per user *gesture* (a full
  // drag, a committed inspector edit, a nudge) — callers mark gesture
  // boundaries with beginGesture(), not on every intermediate update, or
  // undo would only step back a single mouse-move's worth of change.
  const history = ref<Room[][]>([])
  const future = ref<Room[][]>([])

  const dirty = computed(() => {
    if (!draft.value || !original.value) return false
    const diff = diffRooms(original.value.rooms, draft.value.rooms)
    return diff.added.length > 0 || diff.removed.length > 0 || diff.updated.length > 0
  })

  const canUndo = computed(() => history.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  const selectedRoom = computed(
    () => draft.value?.rooms.find((room) => room.id === selectedId.value) ?? null,
  )

  const beginEdit = (building: Building) => {
    original.value = cloneBuilding(building)
    draft.value = cloneBuilding(building)
    selectedId.value = null
    isEditing.value = true
    activeTool.value = 'move'
    history.value = []
    future.value = []
    mergeCandidateId.value = null
  }

  const cancel = () => {
    isEditing.value = false
    draft.value = null
    original.value = null
    selectedId.value = null
    history.value = []
    future.value = []
    mergeCandidateId.value = null
  }

  const select = (id: string | null) => {
    selectedId.value = id
  }

  // Arms merge mode on the currently-selected room; a no-op if nothing is
  // selected. The caller (ModelView) routes the *next* room click to
  // mergeRooms() instead of a normal select while this is set.
  const beginMerge = () => {
    if (!selectedId.value) return
    mergeCandidateId.value = selectedId.value
  }

  const cancelMerge = () => {
    mergeCandidateId.value = null
  }

  const setTool = (tool: EditorTool) => {
    activeTool.value = tool
  }

  // Marks the start of one undoable user gesture. Call once per drag/edit/
  // nudge, before any mutation belonging to that gesture.
  const beginGesture = () => {
    if (!draft.value) return
    history.value.push(cloneRooms(draft.value.rooms))
    if (history.value.length > MAX_HISTORY) history.value.shift()
    future.value = []
  }

  const undo = () => {
    if (!draft.value || history.value.length === 0) return
    future.value.push(cloneRooms(draft.value.rooms))
    draft.value.rooms = history.value.pop()!
  }

  const redo = () => {
    if (!draft.value || future.value.length === 0) return
    history.value.push(cloneRooms(draft.value.rooms))
    draft.value.rooms = future.value.pop()!
  }

  // X/Z always move (grid-snapped by default). Y is optional — omitting it
  // preserves the room's current floor (the historical floor-plane-only
  // behavior); passing it moves the room vertically too. Callers pass
  // snapX/snapZ/snapY: false for an axis that neighbor- or floor-level-
  // snapping already resolved (see ModelView's applySnappedMove), or when the
  // free-move modifier is held, so grid-snap doesn't override a more precise
  // value.
  const moveRoom = (
    id: string,
    position: { x: number; z: number; y?: number },
    options: { snapX?: boolean; snapZ?: boolean; snapY?: boolean } = {},
  ) => {
    if (!draft.value) return
    const room = draft.value.rooms.find((r) => r.id === id)
    if (!room) return
    const snapX = options.snapX ?? true
    const snapZ = options.snapZ ?? true
    const snapY = options.snapY ?? true
    room.position = {
      x: snapX ? snapToGrid(position.x, MOVE_GRID_STEP) : position.x,
      y:
        position.y === undefined
          ? room.position.y
          : snapY
            ? snapToGrid(position.y, MOVE_GRID_STEP)
            : position.y,
      z: snapZ ? snapToGrid(position.z, MOVE_GRID_STEP) : position.z,
    }
  }

  // Resizes one axis to `newDimensionRaw`, compensating position so the given
  // face stays put: 'min' anchors the negative-axis face (growth happens on
  // the positive side), 'max' anchors the positive-axis face, and 'center'
  // leaves the room's center untouched — the last is what the 3D gizmo uses,
  // since three.js's TransformControls scale mode is pivot-centered and any
  // other anchor would visibly jump the room on drag release.
  const resizeRoom = (
    id: string,
    axis: ResizeAxis,
    newDimensionRaw: number,
    anchor: ResizeAnchor = 'center',
  ) => {
    if (!draft.value) return
    const room = draft.value.rooms.find((r) => r.id === id)
    if (!room) return

    const newDimension = Math.max(
      MIN_ROOM_DIMENSION,
      snapToGrid(newDimensionRaw, RESIZE_GRID_STEP),
    )
    const delta = newDimension - room.dimensions[axis]
    const positionKey = AXIS_TO_POSITION_KEY[axis]
    const centerShift = anchor === 'min' ? delta / 2 : anchor === 'max' ? -delta / 2 : 0

    room.dimensions = { ...room.dimensions, [axis]: newDimension }
    room.position = { ...room.position, [positionKey]: room.position[positionKey] + centerShift }
  }

  // Adds a brand-new room to the draft (the 2D floor-plan editor's "draw a
  // rectangle" flow). The id is client-generated — the bulk PUT /rooms Save
  // path treats any id not already on the building as an insert, so the
  // server never needs to hand one back mid-session.
  const addRoom = (seed: {
    position: Room['position']
    dimensions: Room['dimensions']
    name?: string
    capacity?: number
    color?: string
  }): Room | null => {
    if (!draft.value) return null
    const id = crypto.randomUUID()
    const room: Room = {
      id,
      name: seed.name?.trim() || id,
      capacity: seed.capacity ?? 0,
      position: seed.position,
      dimensions: seed.dimensions,
      ...(seed.color !== undefined && { color: seed.color }),
    }
    draft.value.rooms.push(room)
    return room
  }

  // Blocks deleting the building's last room — an empty building has nothing
  // left to edit. Returns whether the delete actually happened, so the caller
  // can surface a message when it's blocked.
  const deleteRoom = (id: string): boolean => {
    if (!draft.value) return false
    if (draft.value.rooms.length <= 1) return false
    if (!draft.value.rooms.some((r) => r.id === id)) return false

    draft.value.rooms = draft.value.rooms.filter((r) => r.id !== id)
    if (selectedId.value === id) selectedId.value = null
    return true
  }

  // Clones a room offset by one grid step on both floor-plane axes — a fast
  // way to build out a repetitive layout (a row of identical offices, etc).
  const duplicateRoom = (id: string): Room | null => {
    if (!draft.value) return null
    const room = draft.value.rooms.find((r) => r.id === id)
    if (!room) return null

    const duplicate: Room = {
      ...room,
      id: crypto.randomUUID(),
      position: {
        ...room.position,
        x: room.position.x + MOVE_GRID_STEP,
        z: room.position.z + MOVE_GRID_STEP,
      },
    }
    draft.value.rooms.push(duplicate)
    return duplicate
  }

  // Merges room B into room A: A keeps its own name/color, its capacity
  // becomes the sum of both, and its box grows to the union of both boxes.
  // Room B is dropped. Sensor/threshold reassignment for the dropped room is
  // a server-side, best-effort concern (see MODEL_EDITOR_PLAN.md §3.4) — the
  // generic bulk Save can't distinguish "merged away" from "just deleted".
  const mergeRooms = (survivorId: string, absorbedId: string): Room | null => {
    if (!draft.value) return null
    const survivor = draft.value.rooms.find((r) => r.id === survivorId)
    const absorbed = draft.value.rooms.find((r) => r.id === absorbedId)
    if (!survivor || !absorbed) return null

    const merged = mergeBoxes(survivor, absorbed)
    survivor.position = merged.position
    survivor.dimensions = merged.dimensions
    survivor.capacity = survivor.capacity + absorbed.capacity

    draft.value.rooms = draft.value.rooms.filter((r) => r.id !== absorbedId)
    if (selectedId.value === absorbedId) selectedId.value = survivorId

    return survivor
  }

  // Backs the inspector panel: a single patch covering any mix of metadata
  // and geometry fields, merged shallowly into position/dimensions.
  const updateRoomFields = (
    id: string,
    patch: {
      name?: string
      color?: string
      capacity?: number
      position?: Partial<Room['position']>
      dimensions?: Partial<Room['dimensions']>
    },
  ) => {
    if (!draft.value) return
    const room = draft.value.rooms.find((r) => r.id === id)
    if (!room) return

    if (patch.name !== undefined) room.name = patch.name
    if (patch.color !== undefined) room.color = patch.color
    if (patch.capacity !== undefined) room.capacity = patch.capacity
    if (patch.position !== undefined) room.position = { ...room.position, ...patch.position }
    if (patch.dimensions !== undefined)
      room.dimensions = { ...room.dimensions, ...patch.dimensions }
  }

  const save = async () => {
    if (!draft.value) return
    isSaving.value = true
    try {
      await buildingsStore.saveRooms(draft.value.id, draft.value.rooms)
      original.value = cloneBuilding(draft.value)
    } finally {
      isSaving.value = false
    }
  }

  return {
    isEditing,
    draft,
    selectedId,
    selectedRoom,
    dirty,
    isSaving,
    activeTool,
    canUndo,
    canRedo,
    mergeCandidateId,
    beginEdit,
    cancel,
    select,
    setTool,
    beginGesture,
    undo,
    redo,
    moveRoom,
    resizeRoom,
    addRoom,
    deleteRoom,
    duplicateRoom,
    mergeRooms,
    beginMerge,
    cancelMerge,
    updateRoomFields,
    save,
  }
}

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
// Separate from 3D's EditorTool: 'select' vs 'add' gate fundamentally different pointer
// behavior, so merging into one type would allow meaningless combos like "resize"+"add".
export type PlanTool = 'select' | 'add'
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

/** Draft-then-commit editing session: mutations land on a deep-cloned `draft`, never the
 * live `building`, so Cancel is free and Save is one diffed request (MODEL_EDITOR_PLAN.md §2). */
export function useModelEditor() {
  const buildingsStore = useBuildingsStore()

  const isEditing = ref(false)
  const draft = ref<Building | null>(null)
  const original = ref<Building | null>(null)
  const selectedId = ref<string | null>(null)
  const isSaving = ref(false)
  const activeTool = ref<EditorTool>('move')
  const planTool = ref<PlanTool>('select')
  // Set while picking the second room for a merge: the toolbar's Merge button arms this on the
  // selected room, then the *next* room click completes the merge instead of re-selecting (see ModelView).
  const mergeCandidateId = ref<string | null>(null)

  // Undo/redo snapshots the whole rooms array once per user *gesture* (a drag, an inspector
  // edit, a nudge) — callers mark boundaries with beginGesture(), not every intermediate update.
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
    planTool.value = 'select'
    history.value = []
    future.value = []
    mergeCandidateId.value = null
  }

  const cancel = () => {
    isEditing.value = false
    draft.value = null
    original.value = null
    selectedId.value = null
    planTool.value = 'select'
    history.value = []
    future.value = []
    mergeCandidateId.value = null
  }

  const select = (id: string | null) => {
    selectedId.value = id
  }

  // Arms merge mode on the selected room (no-op if none selected); the caller (ModelView)
  // routes the *next* room click to mergeRooms() instead of a normal select while this is set.
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

  const setPlanTool = (tool: PlanTool) => {
    planTool.value = tool
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

  // X/Z always move (grid-snapped by default); Y is optional and only moves the room vertically
  // if passed. Callers pass snap*: false when neighbor/floor snapping or free-move already resolved it.
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

  // Resizes one axis, compensating position so the given face stays put: 'min'/'max' anchor
  // that face; 'center' (used by the 3D gizmo, whose TransformControls is pivot-centered) doesn't move it.
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

  // Adds a room to the draft (2D editor's "draw a rectangle" flow). The id is client-generated
  // — the bulk PUT /rooms Save path treats any unknown id as an insert.
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

  // Blocks deleting the building's last room (an empty building has nothing left to edit).
  // Returns whether the delete happened, so the caller can surface a message when blocked.
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

  // Merges B into A: A keeps its name/color, sums capacities, and its box grows to the union.
  // B is dropped; sensor/threshold reassignment is a server-side best-effort concern (§3.4).
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
    planTool,
    canUndo,
    canRedo,
    mergeCandidateId,
    beginEdit,
    cancel,
    select,
    setTool,
    setPlanTool,
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

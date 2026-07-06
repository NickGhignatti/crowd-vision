import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useModelEditor } from '@/composables/scene/useModelEditor.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import type { Building, Room } from '@/models/building.ts'

const { mockSaveRooms } = vi.hoisted(() => ({
  mockSaveRooms: vi.fn<(buildingId: string, rooms: Room[]) => Promise<void>>(),
}))

vi.mock('@/stores/buildings', () => ({
  useBuildingsStore: vi.fn(),
}))

const makeRoom = (id: string, overrides: Partial<Room> = {}): Room => ({
  id,
  name: id,
  capacity: 10,
  position: { x: 0, y: 0, z: 0 },
  dimensions: { width: 2, height: 2, depth: 2 },
  ...overrides,
})

const makeBuilding = (rooms: Room[]): Building => ({
  id: 'b1',
  name: 'Building 1',
  rooms,
  domains: ['acme'],
})

beforeEach(() => {
  vi.mocked(useBuildingsStore).mockReturnValue({
    saveRooms: mockSaveRooms,
  } as unknown as ReturnType<typeof useBuildingsStore>)
  mockSaveRooms.mockReset()
  mockSaveRooms.mockResolvedValue(undefined)
})

describe('useModelEditor', () => {
  describe('beginEdit', () => {
    it('clones the building into a draft, leaving the original untouched', () => {
      const editor = useModelEditor()
      const building = makeBuilding([makeRoom('r1')])

      editor.beginEdit(building)

      expect(editor.isEditing.value).toBe(true)
      expect(editor.draft.value).toEqual(building)
      expect(editor.draft.value).not.toBe(building)
    })

    it('starts with nothing selected and not dirty', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      expect(editor.selectedId.value).toBeNull()
      expect(editor.dirty.value).toBe(false)
    })
  })

  describe('moveRoom', () => {
    it('updates only the draft room position (grid-snapped), not the original building', () => {
      const editor = useModelEditor()
      const building = makeBuilding([makeRoom('r1', { position: { x: 0, y: 2, z: 0 } })])
      editor.beginEdit(building)

      editor.moveRoom('r1', { x: 1.3, z: 2.7 })

      const draftRoom = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(draftRoom?.position.x).toBe(1.5)
      expect(draftRoom?.position.z).toBe(2.5)
      // Y (floor) is untouched by a Phase-1 move — translate is floor-plane constrained.
      expect(draftRoom?.position.y).toBe(2)
      // The original building object passed in must never be mutated.
      expect(building.rooms[0]?.position).toEqual({ x: 0, y: 2, z: 0 })
    })

    it('marks the editor dirty after a move', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      editor.moveRoom('r1', { x: 5, z: 5 })

      expect(editor.dirty.value).toBe(true)
    })

    it('is a no-op when there is no active draft', () => {
      const editor = useModelEditor()
      expect(() => editor.moveRoom('r1', { x: 1, z: 1 })).not.toThrow()
    })

    it('is a no-op for an unknown room id', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      editor.moveRoom('does-not-exist', { x: 1, z: 1 })

      expect(editor.dirty.value).toBe(false)
    })

    it('bypasses grid snap per-axis when snapX/snapZ are false (used for neighbor-snapped or Alt-free-move axes)', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1', { position: { x: 0, y: 2, z: 0 } })]))

      editor.moveRoom('r1', { x: 1.23, z: 4.56 }, { snapX: false, snapZ: false })

      const room = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(room?.position.x).toBe(1.23)
      expect(room?.position.z).toBe(4.56)
    })

    it('snaps only the axis whose bypass flag is false', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1', { position: { x: 0, y: 2, z: 0 } })]))

      editor.moveRoom('r1', { x: 1.3, z: 4.56 }, { snapX: true, snapZ: false })

      const room = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(room?.position.x).toBe(1.5) // grid-snapped
      expect(room?.position.z).toBe(4.56) // passed through raw
    })
  })

  describe('select', () => {
    it('tracks the selected room id', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1'), makeRoom('r2')]))

      editor.select('r2')
      expect(editor.selectedId.value).toBe('r2')

      editor.select(null)
      expect(editor.selectedId.value).toBeNull()
    })
  })

  describe('cancel', () => {
    it('discards the draft and exits edit mode', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))
      editor.moveRoom('r1', { x: 9, z: 9 })

      editor.cancel()

      expect(editor.isEditing.value).toBe(false)
      expect(editor.draft.value).toBeNull()
      expect(editor.dirty.value).toBe(false)
    })
  })

  describe('save', () => {
    it('calls the store with the current draft rooms', async () => {
      const editor = useModelEditor()
      const building = makeBuilding([makeRoom('r1')])
      editor.beginEdit(building)
      editor.moveRoom('r1', { x: 4, z: 4 })

      await editor.save()

      expect(mockSaveRooms).toHaveBeenCalledTimes(1)
      const [buildingId, rooms] = mockSaveRooms.mock.calls[0]!
      expect(buildingId).toBe('b1')
      expect(rooms.find((r) => r.id === 'r1')?.position).toEqual({ x: 4, y: 0, z: 4 })
    })

    it('resets dirty after a successful save while remaining in edit mode', async () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))
      editor.moveRoom('r1', { x: 4, z: 4 })

      await editor.save()

      expect(editor.dirty.value).toBe(false)
      expect(editor.isEditing.value).toBe(true)
    })

    it('leaves dirty state intact when the save fails', async () => {
      mockSaveRooms.mockRejectedValueOnce(new Error('network error'))
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))
      editor.moveRoom('r1', { x: 4, z: 4 })

      await expect(editor.save()).rejects.toThrow('network error')
      expect(editor.dirty.value).toBe(true)
    })

    it('is a no-op when there is no active draft', async () => {
      const editor = useModelEditor()
      await editor.save()
      expect(mockSaveRooms).not.toHaveBeenCalled()
    })
  })

  describe('activeTool', () => {
    it('defaults to move and can be switched to resize', () => {
      const editor = useModelEditor()
      expect(editor.activeTool.value).toBe('move')

      editor.setTool('resize')
      expect(editor.activeTool.value).toBe('resize')
    })
  })

  describe('resizeRoom', () => {
    const makeResizableRoom = () =>
      makeRoom('r1', { position: { x: 0, y: 0, z: 0 }, dimensions: { width: 4, height: 2, depth: 4 } })

    it('anchors the min face by default when growing', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeResizableRoom()]))

      editor.resizeRoom('r1', 'width', 6, 'min')

      const room = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(room?.dimensions.width).toBe(6)
      // min face was at x=0-2=-2; anchoring it means the new min face must
      // still be -2, so the center shifts to -2 + 6/2 = 1.
      expect(room?.position.x).toBe(1)
    })

    it('anchors the max face when requested', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeResizableRoom()]))

      editor.resizeRoom('r1', 'width', 6, 'max')

      const room = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(room?.dimensions.width).toBe(6)
      // max face was at x=0+2=2; anchoring it means new center = 2 - 6/2 = -1.
      expect(room?.position.x).toBe(-1)
    })

    it('keeps the center fixed when anchor is "center" (matches the 3D gizmo default)', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeResizableRoom()]))

      editor.resizeRoom('r1', 'width', 6, 'center')

      const room = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(room?.dimensions.width).toBe(6)
      expect(room?.position.x).toBe(0)
    })

    it('rejects a non-positive resulting dimension by clamping to a minimum', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeResizableRoom()]))

      editor.resizeRoom('r1', 'width', -3, 'center')

      const room = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(room?.dimensions.width).toBeGreaterThan(0)
    })

    it('is a no-op for an unknown room id', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeResizableRoom()]))
      expect(() => editor.resizeRoom('nope', 'width', 6, 'center')).not.toThrow()
    })
  })

  describe('addRoom', () => {
    it('pushes a new room into the draft with a generated id', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      const created = editor.addRoom({
        position: { x: 5, y: 0, z: 5 },
        dimensions: { width: 3, height: 3, depth: 3 },
      })

      expect(created).not.toBeNull()
      expect(editor.draft.value?.rooms).toHaveLength(2)
      expect(editor.draft.value?.rooms.some((r) => r.id === created?.id)).toBe(true)
      expect(created?.position).toEqual({ x: 5, y: 0, z: 5 })
    })

    it('falls back to the id as the name when none is given, and defaults capacity', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      const created = editor.addRoom({
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 2, height: 2, depth: 2 },
      })

      expect(created?.name).toBe(created?.id)
      expect(created?.capacity).toBe(0)
    })

    it('marks the editor dirty', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      editor.addRoom({ position: { x: 0, y: 0, z: 0 }, dimensions: { width: 2, height: 2, depth: 2 } })

      expect(editor.dirty.value).toBe(true)
    })

    it('is a no-op returning null when there is no active draft', () => {
      const editor = useModelEditor()
      const created = editor.addRoom({
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 2, height: 2, depth: 2 },
      })
      expect(created).toBeNull()
    })
  })

  describe('deleteRoom', () => {
    it('removes the room from the draft', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1'), makeRoom('r2')]))

      const result = editor.deleteRoom('r1')

      expect(result).toBe(true)
      expect(editor.draft.value?.rooms.map((r) => r.id)).toEqual(['r2'])
    })

    it('clears the selection if the deleted room was selected', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1'), makeRoom('r2')]))
      editor.select('r1')

      editor.deleteRoom('r1')

      expect(editor.selectedId.value).toBeNull()
    })

    it('blocks deleting the last room in the building', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      const result = editor.deleteRoom('r1')

      expect(result).toBe(false)
      expect(editor.draft.value?.rooms).toHaveLength(1)
    })

    it('returns false for an unknown room id', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1'), makeRoom('r2')]))

      expect(editor.deleteRoom('nope')).toBe(false)
    })

    it('is a no-op returning false when there is no active draft', () => {
      const editor = useModelEditor()
      expect(editor.deleteRoom('r1')).toBe(false)
    })
  })

  describe('duplicateRoom', () => {
    it('clones the room offset by one grid step, with a fresh id', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1', { position: { x: 0, y: 0, z: 0 } })]))

      const duplicate = editor.duplicateRoom('r1')

      expect(duplicate).not.toBeNull()
      expect(duplicate?.id).not.toBe('r1')
      expect(duplicate?.position.x).toBe(0.5)
      expect(duplicate?.position.z).toBe(0.5)
      expect(editor.draft.value?.rooms).toHaveLength(2)
    })

    it('returns null for an unknown room id', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))
      expect(editor.duplicateRoom('nope')).toBeNull()
    })

    it('is a no-op returning null when there is no active draft', () => {
      const editor = useModelEditor()
      expect(editor.duplicateRoom('r1')).toBeNull()
    })
  })

  describe('mergeRooms', () => {
    it('merges two rooms into the union box, keeping the primary name/color and summed capacity', () => {
      const editor = useModelEditor()
      const a = makeRoom('a', {
        name: 'Primary',
        color: '#111111',
        capacity: 10,
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 4, height: 3, depth: 6 },
      })
      const b = makeRoom('b', {
        name: 'Secondary',
        color: '#222222',
        capacity: 5,
        position: { x: 4, y: 0, z: 0 },
        dimensions: { width: 4, height: 3, depth: 6 },
      })
      editor.beginEdit(makeBuilding([a, b]))

      const survivor = editor.mergeRooms('a', 'b')

      expect(survivor?.id).toBe('a')
      expect(survivor?.name).toBe('Primary')
      expect(survivor?.color).toBe('#111111')
      expect(survivor?.capacity).toBe(15)
      expect(survivor?.position).toEqual({ x: 2, y: 0, z: 0 })
      expect(survivor?.dimensions).toEqual({ width: 8, height: 3, depth: 6 })
      expect(editor.draft.value?.rooms.map((r) => r.id)).toEqual(['a'])
    })

    it('drops the absorbed room and clears its selection if selected', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('a'), makeRoom('b')]))
      editor.select('b')

      editor.mergeRooms('a', 'b')

      expect(editor.selectedId.value).toBe('a')
      expect(editor.draft.value?.rooms).toHaveLength(1)
    })

    it('returns null for unknown room ids', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('a')]))
      expect(editor.mergeRooms('a', 'nope')).toBeNull()
    })
  })

  describe('merge candidate (two-click merge UX)', () => {
    it('tracks the first room chosen for merge', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('a'), makeRoom('b')]))
      editor.select('a')

      editor.beginMerge()

      expect(editor.mergeCandidateId.value).toBe('a')
    })

    it('does nothing when nothing is selected', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('a')]))

      editor.beginMerge()

      expect(editor.mergeCandidateId.value).toBeNull()
    })

    it('cancelMerge clears the pending candidate', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('a'), makeRoom('b')]))
      editor.select('a')
      editor.beginMerge()

      editor.cancelMerge()

      expect(editor.mergeCandidateId.value).toBeNull()
    })
  })

  describe('updateRoomFields', () => {
    it('applies a partial patch (name, capacity, color, position, dimensions)', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      editor.updateRoomFields('r1', {
        name: 'Renamed',
        capacity: 42,
        color: '#123456',
        position: { y: 3 },
        dimensions: { height: 5 },
      })

      const room = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(room?.name).toBe('Renamed')
      expect(room?.capacity).toBe(42)
      expect(room?.color).toBe('#123456')
      expect(room?.position).toEqual({ x: 0, y: 3, z: 0 })
      expect(room?.dimensions).toEqual({ width: 2, height: 5, depth: 2 })
    })

    it('is a no-op for an unknown room id', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))
      expect(() => editor.updateRoomFields('nope', { name: 'x' })).not.toThrow()
    })
  })

  describe('undo/redo', () => {
    it('does nothing when there is no history', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      expect(editor.canUndo.value).toBe(false)
      editor.undo()
      expect(editor.draft.value?.rooms[0]?.position).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('restores the exact pre-gesture snapshot', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      editor.beginGesture()
      editor.moveRoom('r1', { x: 4, z: 4 })

      expect(editor.canUndo.value).toBe(true)
      editor.undo()

      const room = editor.draft.value?.rooms.find((r) => r.id === 'r1')
      expect(room?.position).toEqual({ x: 0, y: 0, z: 0 })
      expect(editor.canUndo.value).toBe(false)
    })

    it('supports multiple undo steps in order', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      editor.beginGesture()
      editor.moveRoom('r1', { x: 2, z: 0 })
      editor.beginGesture()
      editor.moveRoom('r1', { x: 4, z: 0 })

      editor.undo()
      expect(editor.draft.value?.rooms.find((r) => r.id === 'r1')?.position.x).toBe(2)

      editor.undo()
      expect(editor.draft.value?.rooms.find((r) => r.id === 'r1')?.position.x).toBe(0)
    })

    it('redo re-applies an undone change', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      editor.beginGesture()
      editor.moveRoom('r1', { x: 4, z: 0 })
      editor.undo()
      expect(editor.canRedo.value).toBe(true)

      editor.redo()
      expect(editor.draft.value?.rooms.find((r) => r.id === 'r1')?.position.x).toBe(4)
      expect(editor.canRedo.value).toBe(false)
    })

    it('clears the redo stack once a new gesture is made after an undo', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      editor.beginGesture()
      editor.moveRoom('r1', { x: 4, z: 0 })
      editor.undo()
      expect(editor.canRedo.value).toBe(true)

      editor.beginGesture()
      editor.moveRoom('r1', { x: 9, z: 0 })

      expect(editor.canRedo.value).toBe(false)
    })

    it('resets history when a new edit session begins', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))
      editor.beginGesture()
      editor.moveRoom('r1', { x: 4, z: 0 })

      editor.beginEdit(makeBuilding([makeRoom('r1')]))

      expect(editor.canUndo.value).toBe(false)
    })

    it('clears history on cancel', () => {
      const editor = useModelEditor()
      editor.beginEdit(makeBuilding([makeRoom('r1')]))
      editor.beginGesture()
      editor.moveRoom('r1', { x: 4, z: 0 })

      editor.cancel()

      expect(editor.canUndo.value).toBe(false)
      expect(editor.canRedo.value).toBe(false)
    })
  })
})

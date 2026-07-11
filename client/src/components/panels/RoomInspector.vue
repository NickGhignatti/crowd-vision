<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Room } from '@/models/building.ts'

interface Props {
  room: Room | null
  floorLevels: number[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  commit: [
    patch: {
      name?: string
      color?: string
      capacity?: number
      position?: Partial<Room['position']>
      dimensions?: Partial<Room['dimensions']>
    },
  ]
}>()

const { t } = useI18n()

const name = ref('')
const capacity = ref(0)
const color = ref('#e2e8f0')
const x = ref(0)
const y = ref(0)
const z = ref(0)
const width = ref(1)
const height = ref(1)
const depth = ref(1)

// Watches a serialized snapshot, not `props.room` itself: the draft's
// moveRoom/resizeRoom/updateRoomFields mutate the room object in place
// (same reference) rather than replacing it, so a reference-based watch
// never re-fires after a gizmo drag or undo/redo — the panel would show
// stale X/Y/Z/W/H/D forever after the first selection.
watch(
  () => (props.room ? JSON.stringify(props.room) : null),
  () => {
    const room = props.room
    if (!room) return
    name.value = room.name
    capacity.value = room.capacity
    color.value = room.color ?? '#e2e8f0'
    x.value = room.position.x
    y.value = room.position.y
    z.value = room.position.z
    width.value = room.dimensions.width
    height.value = room.dimensions.height
    depth.value = room.dimensions.depth
  },
  { immediate: true },
)

const commitName = () => emit('commit', { name: name.value })
const commitCapacity = () => emit('commit', { capacity: Number(capacity.value) })
const commitColor = () => emit('commit', { color: color.value })
const commitX = () => emit('commit', { position: { x: Number(x.value) } })
const commitZ = () => emit('commit', { position: { z: Number(z.value) } })
const commitWidth = () => emit('commit', { dimensions: { width: Number(width.value) } })
const commitHeight = () => emit('commit', { dimensions: { height: Number(height.value) } })
const commitDepth = () => emit('commit', { dimensions: { depth: Number(depth.value) } })

// Floors are discrete PLANS, not a draggable height: the field shows
// "Floor 0/1/2…" (index into the sorted distinct Y levels) and picking one
// moves the room to that floor's Y. "New floor above" stacks a fresh floor
// on top of the current highest, spaced by this room's own height so it sits
// flush above rather than overlapping. Raw world-Y is never exposed.
const floorLabel = (index: number) => `${t('model.editor.floorLabel')} ${index}`

const onFloorSelectChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'new') {
    const top = props.floorLevels.length ? Math.max(...props.floorLevels) : y.value
    emit('commit', { position: { y: top + height.value } })
    return
  }
  emit('commit', { position: { y: Number(value) } })
}
</script>

<template>
  <div
    v-if="room"
    data-testid="room-inspector"
    class="absolute bottom-24 right-4 z-10 w-64 bg-white/95 backdrop-blur rounded-xl shadow-xl border border-slate-200/50 p-4 space-y-3 text-sm"
  >
    <div>
      <label class="block text-xs text-slate-500 mb-1">{{ t('model.rooms.editRoom.name') }}</label>
      <input
        data-testid="name-input"
        v-model="name"
        type="text"
        class="w-full border border-slate-200 rounded px-2 py-1"
        @change="commitName"
      />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-xs text-slate-500 mb-1">{{ t('model.rooms.editRoom.capacity') }}</label>
        <input
          data-testid="capacity-input"
          v-model.number="capacity"
          type="number"
          class="w-full border border-slate-200 rounded px-2 py-1"
          @change="commitCapacity"
        />
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">{{ t('model.rooms.editRoom.themeColor') }}</label>
        <input
          data-testid="color-input"
          v-model="color"
          type="color"
          class="w-full h-8 border border-slate-200 rounded px-1 py-1"
          @change="commitColor"
        />
      </div>
    </div>

    <div>
      <label class="block text-xs text-slate-500 mb-1">{{ t('model.editor.floorLabel') }}</label>
      <select
        data-testid="floor-select"
        :value="String(y)"
        class="w-full border border-slate-200 rounded px-1 py-1"
        @change="onFloorSelectChange"
      >
        <option v-for="(level, index) in floorLevels" :key="level" :value="String(level)">
          {{ floorLabel(index) }}
        </option>
        <option value="new">{{ t('model.editor.newFloorAbove') }}</option>
      </select>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-xs text-slate-500 mb-1">X</label>
        <input
          data-testid="x-input"
          v-model.number="x"
          type="number"
          class="w-full border border-slate-200 rounded px-2 py-1"
          @change="commitX"
        />
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">Z</label>
        <input
          data-testid="z-input"
          v-model.number="z"
          type="number"
          class="w-full border border-slate-200 rounded px-2 py-1"
          @change="commitZ"
        />
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <div>
        <label class="block text-xs text-slate-500 mb-1">W</label>
        <input
          data-testid="width-input"
          v-model.number="width"
          type="number"
          min="0.5"
          step="0.5"
          class="w-full border border-slate-200 rounded px-2 py-1"
          @change="commitWidth"
        />
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">H</label>
        <input
          data-testid="height-input"
          v-model.number="height"
          type="number"
          min="0.5"
          step="0.5"
          class="w-full border border-slate-200 rounded px-2 py-1"
          @change="commitHeight"
        />
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">D</label>
        <input
          data-testid="depth-input"
          v-model.number="depth"
          type="number"
          min="0.5"
          step="0.5"
          class="w-full border border-slate-200 rounded px-2 py-1"
          @change="commitDepth"
        />
      </div>
    </div>
  </div>
</template>

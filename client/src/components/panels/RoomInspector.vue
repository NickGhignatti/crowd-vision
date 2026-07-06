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
const isCustomFloor = ref(false)

watch(
  () => props.room,
  (room) => {
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
    isCustomFloor.value = !props.floorLevels.includes(room.position.y)
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

const onFloorSelectChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'custom') {
    isCustomFloor.value = true
    return
  }
  isCustomFloor.value = false
  y.value = Number(value)
  emit('commit', { position: { y: y.value } })
}

const commitCustomFloor = () => emit('commit', { position: { y: Number(y.value) } })
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

    <div class="grid grid-cols-3 gap-2">
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
        <label class="block text-xs text-slate-500 mb-1">Y</label>
        <select
          data-testid="y-select"
          :value="isCustomFloor ? 'custom' : String(y)"
          class="w-full border border-slate-200 rounded px-1 py-1"
          @change="onFloorSelectChange"
        >
          <option v-for="level in floorLevels" :key="level" :value="String(level)">{{ level }}</option>
          <option value="custom">{{ t('model.editor.customFloor') }}</option>
        </select>
        <input
          v-if="isCustomFloor"
          data-testid="y-custom-input"
          v-model.number="y"
          type="number"
          class="w-full border border-slate-200 rounded px-2 py-1 mt-1"
          @change="commitCustomFloor"
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

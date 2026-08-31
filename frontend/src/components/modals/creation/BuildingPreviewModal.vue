<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RoomDraft } from '@/models/buildingDraft.ts'

const props = defineProps<{
  isOpen: boolean
  rooms: RoomDraft[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()

const PADDING = 1

/** Storeys are read back off the geometry, so this works for uploaded JSON too. */
const floors = computed(() => {
  const byElevation = new Map<number, RoomDraft[]>()
  for (const room of props.rooms) {
    const elevation = room.position.y
    const existing = byElevation.get(elevation)
    if (existing) existing.push(room)
    else byElevation.set(elevation, [room])
  }
  return [...byElevation.entries()]
    .sort(([a], [b]) => a - b)
    .map(([elevation, rooms], index) => ({ index, elevation, rooms }))
})

const selected = ref(0)

watch(
  () => props.isOpen,
  (open) => {
    if (open) selected.value = 0
  },
)

const current = computed(() => floors.value[selected.value] ?? null)

/**
 * The plan is drawn from above, so the drawing's axes are x and z — y is the storey.
 * `position` is a room's centre, hence the half-extent offsets.
 */
const extent = computed(() => {
  const rooms = props.rooms
  if (rooms.length === 0) return null

  const minX = Math.min(...rooms.map((r) => r.position.x - r.dimensions.width / 2))
  const maxX = Math.max(...rooms.map((r) => r.position.x + r.dimensions.width / 2))
  const minZ = Math.min(...rooms.map((r) => r.position.z - r.dimensions.depth / 2))
  const maxZ = Math.max(...rooms.map((r) => r.position.z + r.dimensions.depth / 2))

  return {
    minX,
    minZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    viewBox: `${minX - PADDING} ${minZ - PADDING} ${maxX - minX + PADDING * 2} ${maxZ - minZ + PADDING * 2}`,
  }
})

const palette = ['#cfe8ff', '#ffe9c7', '#d8f5d0', '#e9d5ff', '#fed7aa', '#bae6fd', '#fecaca']
const fillFor = (index: number) => palette[index % palette.length]

const round = (value: number) => Math.round(value * 10) / 10
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[110] flex items-center justify-center p-4 font-sans"
      >
        <div class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" @click="emit('close')"></div>

        <div
          class="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
          @click.stop
        >
          <div
            class="px-6 py-5 border-b border-slate-100 bg-emerald-50/50 shrink-0 flex justify-between items-center"
          >
            <div>
              <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                <i class="ph-bold ph-eye text-emerald-600"></i>
                {{ t('model.register.preview.title') }}
              </h3>
              <p class="mt-1 text-xs text-slate-500">{{ t('model.register.preview.hint') }}</p>
            </div>
            <button
              class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
              @click="emit('close')"
            >
              <i class="ph-bold ph-x text-xl"></i>
            </button>
          </div>

          <div class="overflow-y-auto flex-1 p-6 space-y-4">
            <p v-if="!extent || !current" class="text-sm text-slate-500">
              {{ t('model.register.preview.empty') }}
            </p>

            <template v-else>
              <div v-if="floors.length > 1" class="flex flex-wrap gap-2">
                <button
                  v-for="floor in floors"
                  :key="floor.index"
                  type="button"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  :class="
                    floor.index === selected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  "
                  @click="selected = floor.index"
                >
                  {{ t('model.register.plan.floorRow', { index: floor.index }) }}
                </button>
              </div>

              <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 overflow-x-auto">
                <svg :viewBox="extent.viewBox" class="w-full" style="max-height: 55vh">
                  <g
                    v-for="(room, index) in current.rooms"
                    :key="room.id"
                    :transform="`translate(${room.position.x - room.dimensions.width / 2}, ${room.position.z - room.dimensions.depth / 2})`"
                  >
                    <rect
                      :width="room.dimensions.width"
                      :height="room.dimensions.depth"
                      :fill="room.color ?? fillFor(index)"
                      stroke="#334155"
                      stroke-width="0.12"
                      rx="0.15"
                    />
                    <text
                      :x="room.dimensions.width / 2"
                      :y="room.dimensions.depth / 2"
                      text-anchor="middle"
                      fill="#0f172a"
                      font-size="0.85"
                      font-family="sans-serif"
                    >
                      {{ room.name }}
                    </text>
                    <text
                      :x="room.dimensions.width / 2"
                      :y="room.dimensions.depth / 2 + 1"
                      text-anchor="middle"
                      fill="#64748b"
                      font-size="0.65"
                      font-family="sans-serif"
                    >
                      {{ round(room.dimensions.width) }} × {{ round(room.dimensions.depth) }} m
                    </text>
                  </g>
                </svg>
              </div>

              <p class="text-xs text-slate-500">
                {{
                  t('model.register.preview.summary', {
                    rooms: current.rooms.length,
                    width: round(extent.width),
                    depth: round(extent.depth),
                  })
                }}
              </p>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

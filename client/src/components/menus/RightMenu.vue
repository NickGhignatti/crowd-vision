<script setup lang="ts">
import { ref } from 'vue'
import type { BuildingPayload } from '@/scripts/schema.ts'

const props = defineProps<{
  building: BuildingPayload | null
}>()

const isRightOpen = ref(true)

const toggleRight = () => (isRightOpen.value = !isRightOpen.value)

const getTempColor = (temp: number) => {
  if (temp > 30) return 'text-rose-500'
  if (temp < 18) return 'text-sky-500'
  return 'text-emerald-600'
}
</script>

<template>
  <aside
    class="bg-white border-l border-slate-200 transition-all duration-300 ease-in-out flex flex-col relative z-30 shadow-sm"
    :class="isRightOpen ? 'w-80' : 'w-0 overflow-hidden border-none'"
  >
    <div class="p-6 h-full overflow-y-auto w-80">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-lg font-bold text-slate-800">Room List</h2>

        <button
          @click="toggleRight"
          class="text-slate-400 hover:text-emerald-600 transition-colors p-1"
        >
          <i class="ph-bold ph-caret-right text-xl"></i>
        </button>
      </div>

      <div class="space-y-4">
        <div v-if="!props.building || props.building.rooms.length === 0" class="text-center py-10">
          <p class="text-slate-400 text-sm">No rooms data available.</p>
        </div>

        <div
          v-else
          v-for="room in props.building.rooms"
          :key="room.id"
          class="group p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-emerald-200 hover:shadow-sm transition-all duration-200"
        >
          <div class="flex justify-between items-start mb-3 border-b border-slate-200 pb-2">
            <div>
              <span class="text-xs font-bold text-emerald-600 uppercase tracking-wider block"
                >ID</span
              >
              <span class="text-slate-700 font-bold font-mono">#{{ room.id }}</span>
            </div>
            <span
              v-if="room.color"
              class="w-3 h-3 rounded-full shadow-sm border border-slate-200"
              :style="{ backgroundColor: room.color }"
            ></span>
          </div>

          <div class="space-y-2">
            <div class="flex justify-between items-center text-sm">
              <span class="text-slate-500 font-medium">Temperature</span>
              <span class="font-bold" :class="getTempColor(22)">
                22°C
              </span>
            </div>

            <div class="flex justify-between items-center text-sm">
              <span class="text-slate-500 font-medium">Occupancy</span>
              <div class="flex items-center gap-1.5 text-slate-700 font-bold">
                <span>1 / {{ room.capacity }}</span>
                <i class="ph-bold ph-users text-slate-400"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>

  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 translate-x-2"
    enter-to-class="opacity-100 translate-x-0"
  >
    <button
      v-if="!isRightOpen"
      @click="toggleRight"
      class="absolute right-6 top-4 z-40 bg-white p-2 rounded-lg shadow-lg border border-slate-200 text-slate-600 hover:text-emerald-600 hover:scale-105 transition-all"
      title="Open Room List"
    >
      <i class="ph-bold ph-caret-left text-xl"></i>
    </button>
  </Transition>
</template>

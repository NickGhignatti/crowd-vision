<script setup lang="ts">
import { ref } from 'vue'
import type { BuildingPayload } from '@/scripts/schema.ts'
import { useI18n } from 'vue-i18n'
import Room from './items/Room.vue'

const props = defineProps<{
  building: BuildingPayload | null
  selectedRoomId: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-select', id: string): void
}>()

const isRightOpen = ref(true)
const toggleRight = () => (isRightOpen.value = !isRightOpen.value)
const { t } = useI18n()
</script>

<template>
  <aside
    class="bg-white border-l border-slate-200 transition-all duration-300 ease-in-out flex flex-col relative z-30 shadow-sm"
    :class="isRightOpen ? 'w-80' : 'w-0 overflow-hidden border-none'"
  >
    <div class="p-6 h-full overflow-y-auto w-80">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-lg font-bold text-slate-800">{{ t('model.RightMenu.roomsList') }}</h2>
        <button
          @click="toggleRight"
          class="text-slate-400 hover:text-emerald-600 transition-colors p-1"
        >
          <i class="ph-bold ph-caret-right text-xl"></i>
        </button>
      </div>

      <div class="space-y-4">
        <div v-if="!props.building || props.building.rooms.length === 0" class="text-center py-10">
          <p class="text-slate-400 text-sm">{{ t('model.RightMenu.missingRooms') }}</p>
        </div>

        <div v-else class="space-y-3">
          <Room
            v-for="room in props.building.rooms"
            :key="room.id"
            :room="room"
            :is-selected="props.selectedRoomId === room.id"
            @select="emit('toggle-select', $event)"
          />
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

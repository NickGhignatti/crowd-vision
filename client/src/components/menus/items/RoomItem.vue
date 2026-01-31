<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { RoomPayload } from '@/scripts/schema'

const props = defineProps<{
  room: RoomPayload
  isSelected: boolean
  canEdit?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'edit', room: RoomPayload): void
}>()

const { t } = useI18n()

const getTempColor = (temp: number) => {
  if (temp > 30) return 'text-rose-500'
  if (temp < 18) return 'text-sky-500'
  return 'text-emerald-600'
}
</script>

<template>
  <div
    @click="emit('select', props.room.id)"
    class="group p-4 bg-slate-50 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden"
    :class="[
      isSelected
        ? 'border-emerald-600 shadow-md ring-1 ring-emerald-600 bg-white'
        : 'border-slate-100 hover:border-emerald-200 hover:shadow-sm',
    ]"
  >
    <div v-if="isSelected" class="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600"></div>

    <div class="flex justify-between items-start mb-3 border-b border-slate-200 pb-2">
      <div>
        <span class="text-xs font-bold text-emerald-600 uppercase tracking-wider block">ID</span>
        <div class="flex items-center gap-2">
          <span class="text-slate-700 font-bold font-mono">#{{ room.id }}</span>

          <button
            v-if="canEdit"
            @click.stop="emit('edit', props.room)"
            class="p-1 text-slate-300 hover:text-emerald-600 transition-colors rounded hover:bg-emerald-50"
            title="Edit Room"
          >
            <i class="ph-bold ph-pencil-simple text-sm"></i>
          </button>
        </div>
      </div>
      <span
        v-if="room.color"
        class="w-3 h-3 rounded-full shadow-sm border border-slate-200"
        :style="{ backgroundColor: room.color }"
      ></span>
    </div>

    <div class="space-y-2">
      <div class="flex justify-between items-center text-sm">
        <span class="text-slate-500 font-medium">{{ t('model.RightMenu.temperature') }}</span>
        <span class="font-bold" :class="getTempColor(22)"> 22°C </span>
      </div>

      <div class="flex justify-between items-center text-sm">
        <span class="text-slate-500 font-medium">{{ t('model.RightMenu.occupancy') }}</span>
        <div class="flex items-center gap-1.5 text-slate-700 font-bold">
          <span>1 / {{ room.capacity }}</span>
          <i class="ph-bold ph-users text-slate-400"></i>
        </div>
      </div>
    </div>
  </div>
</template>

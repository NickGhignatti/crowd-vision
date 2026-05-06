<script setup lang="ts">
import type { Room } from '@/models/building.ts'

import { useI18n } from 'vue-i18n'
import { roomColorByTemperature, roomColorByAirQuality } from '@/helpers/colors.ts'

const { t } = useI18n()

const props = defineProps<{
  room: Room
  isSelected: boolean
  canEdit?: boolean
  temp?: number
  people?: number
  indoorAqi?: number
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'edit', room: Room): void
}>()
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

    <div class="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-sm font-bold text-slate-800 leading-tight">{{ room.name }}</span>
          <button
            v-if="canEdit"
            @click.stop="emit('edit', props.room)"
            class="p-1 text-slate-300 hover:text-emerald-600 transition-colors rounded hover:bg-emerald-50"
            :title="t('model.rooms.editRoom.title')"
          >
            <i class="ph-bold ph-pencil-simple text-sm"></i>
          </button>
        </div>
      </div>
      <span
        ><i
          class="ph-bold ph-wind"
          :style="{ color: roomColorByAirQuality(props.indoorAqi ?? 0.0) }"
        ></i
      ></span>
      <span
        v-if="room.color"
        class="w-3 h-3 rounded-full shadow-sm border border-slate-200"
        :style="{ backgroundColor: room.color }"
      ></span>
    </div>

    <div class="space-y-2">
      <div class="flex justify-between items-center text-sm">
        <span class="text-slate-500 font-medium">{{ t('model.rooms.temperature') }}</span>
        <span class="font-bold" :style="{ color: roomColorByTemperature(props.temp ?? 0.0) }">
          {{ props.temp != null ? props.temp + '°C' : '--' }}
        </span>
      </div>

      <div class="flex justify-between items-center text-sm">
        <span class="text-slate-500 font-medium">{{ t('model.rooms.occupancy') }}</span>
        <div class="flex items-center gap-1.5 text-slate-700 font-bold">
          <span>{{ props.people != null ? props.people : '--' }} / {{ room.capacity }}</span>
          <i class="ph-bold ph-users text-slate-400"></i>
        </div>
      </div>

      <!--      <div class="flex justify-between items-center text-sm">-->
      <!--        <span class="text-slate-500 font-medium">{{ t('model.rooms.airQuality') }}</span>-->
      <!--        <span class="font-bold" :style="{ color: roomColorByAirQuality(props.indoorAqi ?? 0.0) }">-->
      <!--          {{ props.indoorAqi != null ? props.indoorAqi.toFixed(1) + '%' : '&#45;&#45;' }}-->
      <!--        </span>-->
      <!--      </div>-->

      <div class="flex justify-between items-center text-sm">
        <span class="text-slate-500 font-medium">{{ t('model.rooms.editRoom.maxTemp') }}</span>
        <span class="font-bold text-slate-700">
          {{ room.maxTemperature !== undefined ? room.maxTemperature + '°C' : '--' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { BuildingPayload } from '@/models/building'
import FloorSelector from '@/components/buttons/FloorSelector.vue'

const { t } = useI18n()

defineProps<{
  buildingId: string
  isSelected: boolean
  buildingModel: BuildingPayload | null
  availableFloors: number[]
  showControls: boolean
  activeFloor: number | null
}>()

const emit = defineEmits<{
  select: []
  'toggle-controls': [event: Event]
  'change-floor': [floorY: number | null]
}>()

const floorModel = defineModel<number | null>('activeFloor')
</script>

<template>
  <div>
    <div
      class="p-4 rounded-xl border cursor-pointer transition-all duration-200 ease-in-out relative group"
      :class="[
        isSelected
          ? 'border-emerald-500 bg-emerald-50 shadow-md ring-1 ring-emerald-500'
          : 'border-slate-100 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-md hover:-translate-y-0.5',
      ]"
      @click="emit('select')"
    >
      <div class="pr-8">
        <span
          class="text-xs font-bold uppercase tracking-wider"
          :class="isSelected ? 'text-emerald-700' : 'text-emerald-600'"
        >
          {{ t('model.name') }}:
        </span>
        <p class="text-slate-700 font-medium mt-1 truncate">{{ buildingId }}</p>
      </div>

      <button
        v-if="isSelected"
        @click.stop="emit('toggle-controls', $event)"
        class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all"
        :class="
          showControls
            ? 'bg-emerald-200/50 text-emerald-700'
            : 'text-emerald-600/70 hover:bg-emerald-100 hover:text-emerald-700'
        "
        :title="t('model.controls.toggleControls')"
      >
        <i class="ph-bold ph-sliders-horizontal text-xl"></i>
      </button>
    </div>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="isSelected && showControls && buildingModel && availableFloors.length > 0"
        class="mt-2 ml-4 relative"
      >
        <div
          class="absolute -left-4 top-0 bottom-4 w-4 border-l-2 border-b-2 border-slate-200 rounded-bl-xl pointer-events-none"
        ></div>
        <FloorSelector :available-floors="availableFloors" v-model="floorModel" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { Building } from '@/models/building.ts'
import StandardInput from '@/components/inputs/StandardInput.vue'

import { useI18n } from 'vue-i18n'
import { ref, watch } from 'vue'

const { t } = useI18n()

const props = defineProps<{
  isOpen: boolean
  building: Building | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', updates: Partial<Building>): void
}>()

const form = ref({
  name: '',
  maxTemperature: 27,
})

watch(
  () => props.building,
  (newBuilding) => {
    if (newBuilding) {
      form.value = {
        name: newBuilding.name || newBuilding.id,
        maxTemperature: newBuilding.maxTemperature ?? 27,
      }
    }
  },
  { immediate: true },
)

const save = () => {
  if (!props.building) return
  emit('save', { ...form.value })
  emit('close')
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="emit('close')"></div>

      <div
        class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all border border-slate-100"
        @click.stop
      >
        <div
          class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50"
        >
          <div>
            <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
              <i class="ph-bold ph-buildings text-emerald-600"></i>
              {{ t('commons.edit') || 'Edit BuildingsSelector' }}
            </h3>
          </div>
          <button
            @click="emit('close')"
            class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
          >
            <i class="ph-bold ph-x text-xl"></i>
          </button>
        </div>

        <div class="p-6 space-y-5">
          <StandardInput :label="t('model.name') || 'BuildingsSelector Name'" icon="ph-text-t">
            <input
              v-model="form.name"
              type="text"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-700 font-semibold focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
            />
          </StandardInput>

          <StandardInput
            :label="t('model.maxTemp') || 'Max Temperature'"
            icon="ph-thermometer-hot"
            icon-focus-class="group-focus-within:text-rose-500"
          >
            <input
              v-model.number="form.maxTemperature"
              type="number"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-700 font-bold focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
            />
          </StandardInput>
        </div>

        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            @click="emit('close')"
            class="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            {{ t('commons.cancel') || 'Cancel' }}
          </button>
          <button
            @click="save"
            class="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-lg shadow-emerald-600/20 rounded-xl transition-all flex items-center gap-2"
          >
            <i class="ph-bold ph-check"></i>
            {{ t('commons.save') || 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

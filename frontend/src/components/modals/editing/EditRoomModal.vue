<script setup lang="ts">
import type { Room } from '@/models/building.ts'
import StandardInput from '@/components/inputs/StandardInput.vue'

import { useI18n } from 'vue-i18n'
import { ref, watch, computed } from 'vue'

const { t } = useI18n()

const props = defineProps<{
  isOpen: boolean
  room: Room | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', maxTemperature: number): void
}>()

// The room's own fields (name, capacity, colour, geometry) come from the
// uploaded model and are read-only — only the alert threshold, which belongs
// to telemetry rather than the twin, is editable here.
const maxTemperature = ref(27)

watch(
  () => props.room,
  (newRoom) => {
    if (newRoom) maxTemperature.value = newRoom.maxTemperature ?? 27
  },
  { immediate: true },
)

const save = () => {
  if (!props.room) return
  emit('save', maxTemperature.value)
  emit('close')
}

const headerStyle = computed(() => ({
  background: `linear-gradient(135deg, ${props.room?.color ?? '#10b981'}22 0%, white 100%)`,
}))
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
        <!-- Header -->
        <div
          class="px-6 py-5 border-b border-slate-100 flex justify-between items-center"
          :style="headerStyle"
        >
          <div>
            <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
              <i class="ph-bold ph-sliders-horizontal text-emerald-600"></i>
              {{ t('model.rooms.editRoom.title') }}
            </h3>
            <p class="text-xs text-slate-500 font-medium mt-0.5 ml-7">
              {{ t('model.rooms.editRoom.subtitle') }}
            </p>
          </div>
          <button
            @click="emit('close')"
            class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
          >
            <i class="ph-bold ph-x text-xl"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-5">
          <p class="text-sm text-slate-500">
            {{ t('model.rooms.editRoom.readOnlyNotice') }}
          </p>

          <StandardInput
            :label="t('model.rooms.editRoom.maxTemp')"
            icon="ph-thermometer-hot"
            icon-focus-class="group-focus-within:text-rose-500"
          >
            <input
              v-model.number="maxTemperature"
              type="number"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-700 font-bold focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
            />
          </StandardInput>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            @click="emit('close')"
            class="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            {{ t('commons.cancel') }}
          </button>
          <button
            @click="save"
            class="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-lg shadow-emerald-600/20 rounded-xl transition-all flex items-center gap-2"
          >
            <i class="ph-bold ph-check"></i>
            {{ t('commons.save') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

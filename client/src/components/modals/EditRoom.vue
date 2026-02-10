<script setup lang="ts">
import type { RoomPayload } from '@/models/building'

import { useI18n } from 'vue-i18n'
import { ref, watch, computed } from 'vue'

const { t } = useI18n()

const props = defineProps<{
  isOpen: boolean
  room: RoomPayload | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', updates: Partial<RoomPayload>): void
}>()

const form = ref({
  id: '',
  capacity: 0,
  maxTemperature: 28,
  color: '#10b981',
})

watch(
  () => props.room,
  (newRoom) => {
    if (newRoom) {
      form.value = {
        id: newRoom.id,
        capacity: newRoom.capacity,
        maxTemperature: newRoom.maxTemperature ?? 28,
        color: newRoom.color || '#10b981',
      }
    }
  },
  { immediate: true },
)

const save = () => {
  if (!props.room) return
  emit('save', { ...form.value })
  emit('close')
}

const headerStyle = computed(() => ({
  background: `linear-gradient(135deg, ${form.value.color}22 0%, white 100%)`,
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

        <div class="p-6 space-y-5">
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">{{
              t('model.rooms.editRoom.identifier')
            }}</label>
            <div class="relative group">
              <i
                class="ph-bold ph-tag absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors"
              ></i>
              <input
                v-model="form.id"
                type="text"
                class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-700 font-mono font-bold focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                :placeholder="t('modals.editRoom.identifierPlaceholder')"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-5">
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">{{
                t('model.rooms.editRoom.capacity')
              }}</label>
              <div class="relative group">
                <i
                  class="ph-bold ph-users absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors"
                ></i>
                <input
                  v-model.number="form.capacity"
                  type="number"
                  min="1"
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-700 font-bold focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">{{
                t('model.rooms.editRoom.maxTemp')
              }}</label>
              <div class="relative group">
                <i
                  class="ph-bold ph-thermometer-hot absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-500 transition-colors"
                ></i>
                <input
                  v-model.number="form.maxTemperature"
                  type="number"
                  class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-700 font-bold focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">{{
              t('model.rooms.editRoom.themeColor')
            }}</label>
            <div class="flex gap-3 items-center p-2 border border-slate-200 rounded-xl bg-slate-50">
              <div
                class="relative w-12 h-10 overflow-hidden rounded-lg shadow-sm ring-1 ring-slate-200"
              >
                <input
                  v-model="form.color"
                  type="color"
                  class="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer p-0 border-0"
                />
              </div>
              <input
                v-model="form.color"
                type="text"
                class="flex-1 bg-transparent font-mono text-sm font-medium text-slate-600 outline-none uppercase"
                maxlength="7"
              />
            </div>
          </div>
        </div>

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

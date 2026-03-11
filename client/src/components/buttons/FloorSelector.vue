<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  availableFloors: number[]
}>()

const activeFloor = defineModel<number | null>()
</script>

<template>
  <div class="bg-slate-50 rounded-xl border border-slate-200 p-3 shadow-sm">
    <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
      {{ t('model.controls.floorSelection') }}
    </label>
    <div class="relative">
      <select
        v-model="activeFloor"
        class="w-full bg-white text-slate-700 text-xs font-medium rounded-lg px-3 py-2.5 border border-slate-200 outline-none shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer hover:border-emerald-300 transition-colors"
      >
        <option :value="null">All Floors</option>
        <option v-for="(floorY, idx) in availableFloors" :key="floorY" :value="floorY">
          {{ t('model.controls.floor') }} {{ idx }} ({{ floorY }}m)
        </option>
      </select>
      <i
        class="ph-bold ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-sm"
      ></i>
    </div>
  </div>
</template>

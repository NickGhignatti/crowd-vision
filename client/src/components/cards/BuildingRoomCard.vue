<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import RangeSlider from '@/components/inputs/RangeSlider.vue'
import type { RoomDraft, RoomThresholdDraft } from '@/models/buildingDraft.ts'

const props = defineProps<{
  room: RoomDraft
}>()

const emit = defineEmits<{
  (e: 'update', patch: Partial<RoomDraft>): void
}>()

const { t } = useI18n()

const cosmeticAqiMin = ref(0)
const localName = ref(props.room.name)
const thresholds = ref<RoomThresholdDraft>({ ...props.room.thresholds })

watch(() => props.room.name, (v) => { localName.value = v })
watch(
  () => props.room.thresholds,
  (v) => { thresholds.value = { ...v } },
  { deep: true },
)

const onName = (e: Event) => {
  localName.value = (e.target as HTMLInputElement).value
  emit('update', { name: localName.value })
}

const onTempMin = (v: number) => {
  thresholds.value.minTemp = v
  emit('update', { thresholds: { ...thresholds.value } })
}

const onTempMax = (v: number) => {
  thresholds.value.maxTemp = v
  emit('update', { thresholds: { ...thresholds.value } })
}

const onAqiMax = (v: number) => {
  thresholds.value.maxAqi = v
  emit('update', { thresholds: { ...thresholds.value } })
}

const onCapacity = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value)
  thresholds.value.maxPeople = val
  emit('update', { capacity: val, thresholds: { ...thresholds.value } })
}
</script>

<template>
  <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div class="flex flex-col gap-0.5 min-w-0">
        <input
          type="text"
          :value="localName"
          class="text-sm font-bold text-slate-700 bg-transparent border-b border-slate-200 focus:border-emerald-500 outline-none py-0.5 w-full transition-colors"
          @input="onName"
        />
        <span class="text-[10px] text-slate-400 font-mono truncate">{{ room.id }}</span>
      </div>
      <div class="flex items-center gap-1.5 text-slate-500 shrink-0">
        <i class="ph-bold ph-users text-sm"></i>
        <input
          type="number"
          :value="thresholds.maxPeople"
          min="0"
          class="w-16 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center outline-none focus:border-emerald-500 transition-colors"
          @input="onCapacity"
        />
      </div>
    </div>

    <div class="space-y-1.5">
      <p class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <i class="ph-bold ph-thermometer-hot text-rose-400"></i>
        {{ t('model.rooms.temperature') }}
      </p>
      <RangeSlider
        :min="0"
        :max="50"
        :min-value="thresholds.minTemp"
        :max-value="thresholds.maxTemp"
        unit="°C"
        active-color="#f43f5e"
        @update:min-value="onTempMin"
        @update:max-value="onTempMax"
      />
    </div>

    <div class="space-y-1.5">
      <p class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <i class="ph-bold ph-wind text-blue-400"></i>
        {{ t('model.register.room.indoorAqi') }}
      </p>
      <RangeSlider
        :min="0"
        :max="200"
        :min-value="cosmeticAqiMin"
        :max-value="thresholds.maxAqi"
        unit="%"
        active-color="#3b82f6"
        @update:min-value="cosmeticAqiMin = $event"
        @update:max-value="onAqiMax"
      />
    </div>
  </div>
</template>

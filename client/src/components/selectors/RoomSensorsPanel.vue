<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RoomSensorRecord } from '@/composables/building/useSensorData.ts'
import type { SensorDraftType } from '@/models/buildingDraft.ts'

const props = defineProps<{
  roomId: string
  roomName: string
  sensors: RoomSensorRecord[]
  isLoading?: boolean
  error?: string | null
  onRegisterSensor: (payload: {
    roomId: string
    sensorId: string
    sensorType: SensorDraftType
  }) => Promise<void>
}>()

const { t } = useI18n()
const isOpen = ref(false)
const sensorId = ref('')
const sensorType = ref<SensorDraftType>('temperature')
const actionError = ref<string | null>(null)

const togglePanel = () => {
  isOpen.value = !isOpen.value
}

const handleRegisterSensor = async () => {
  const trimmedSensorId = sensorId.value.trim()
  if (!trimmedSensorId) return

  actionError.value = null

  try {
    await props.onRegisterSensor({
      roomId: props.roomId,
      sensorId: trimmedSensorId,
      sensorType: sensorType.value,
    })

    sensorId.value = ''
    sensorType.value = 'temperature'
  } catch {
    actionError.value = t('model.rooms.sensors.registerError')
  }
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      @click="togglePanel"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <i :class="isOpen ? 'ph-bold ph-caret-down' : 'ph-bold ph-caret-right'"></i>
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-slate-800">{{ t('model.rooms.sensors.title') }}</p>
          <p class="truncate text-xs text-slate-500">{{ roomName }}</p>
        </div>
      </div>

      <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
        {{ sensors.length }}
      </span>
    </button>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div v-if="isOpen" class="border-t border-slate-200 bg-slate-50">
        <div class="max-h-64 overflow-y-auto custom-scrollbar p-3 space-y-3">
          <div class="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-3 items-end">
              <div>
                <label class="text-xs font-semibold text-slate-500">
                  {{ t('model.rooms.sensors.sensorId') }}
                </label>
                <input
                  v-model="sensorId"
                  type="text"
                  class="w-full bg-transparent border-b-2 border-slate-200 focus:border-emerald-500 outline-none py-1.5 text-slate-800 font-semibold text-sm placeholder:text-slate-400 transition-colors"
                  :placeholder="t('model.rooms.sensors.sensorIdPlaceholder')"
                />
              </div>

              <div>
                <label class="text-xs font-semibold text-slate-500">
                  {{ t('model.rooms.sensors.sensorType') }}
                </label>
                <select
                  v-model="sensorType"
                  class="w-full bg-white border-b-2 border-slate-200 focus:border-emerald-500 outline-none py-1.5 text-slate-800 font-semibold text-sm"
                >
                  <option value="temperature">
                    {{ t('model.rooms.sensors.types.temperature') }}
                  </option>
                </select>
              </div>

              <button
                type="button"
                class="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!sensorId.trim()"
                @click="handleRegisterSensor"
              >
                <i class="ph-bold ph-plus"></i>
                {{ t('model.rooms.sensors.add') }}
              </button>
            </div>
          </div>

          <p v-if="error" class="text-xs font-semibold text-rose-500">{{ t('model.rooms.sensors.error') }}</p>
          <p v-if="actionError" class="text-xs font-semibold text-rose-500">{{ actionError }}</p>
          <p v-else-if="isLoading" class="text-xs font-semibold text-slate-500">
            {{ t('model.rooms.sensors.loading') }}
          </p>

          <div v-if="sensors.length > 0" class="space-y-2">
            <div
              v-for="sensor in sensors"
              :key="sensor.sensorId"
              class="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center justify-between gap-3"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-bold text-slate-800">{{ sensor.sensorId }}</p>
                <p class="text-xs text-slate-500">{{ t('model.rooms.sensors.types.temperature') }}</p>
              </div>
              <span class="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                {{ t('model.rooms.sensors.types.temperature') }}
              </span>
            </div>
          </div>

          <p v-else-if="!isLoading" class="text-xs text-slate-400">
            {{ t('model.rooms.sensors.empty') }}
          </p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 2px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #94a3b8;
}
</style>

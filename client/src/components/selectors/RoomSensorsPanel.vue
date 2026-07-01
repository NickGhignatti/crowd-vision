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
  onSendAction: (payload: {
    roomId: string
    sensorId: string
    sensorType: string
    actionName: string
    actionArguments: string[]
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

const handleSendAction = async (
  sensorId: string, 
  sensorType: string,
  actionName: string,
  actionArguments: string[]
) => {
  const trimmedSensorId = sensorId.trim()
  if (!trimmedSensorId) return
  console.log(sensorId)
  actionError.value = null

  try {
    await props.onSendAction({
      roomId: props.roomId,
      sensorId: trimmedSensorId,
      sensorType: sensorType,
      actionName: actionName,
      actionArguments: actionArguments,
    })

  } catch {
    actionError.value = t('model.rooms.sensors.registerError')
  }
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
  <div class="rounded-lg border border-slate-200 bg-white overflow-hidden" @click.stop>
    
    <button
      type="button"
      class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
      @click.stop="togglePanel"
    >
      <div class="flex items-center gap-2 min-w-0">
        <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-50 text-emerald-600">
          <i class="text-xs" :class="isOpen ? 'ph-bold ph-caret-down' : 'ph-bold ph-caret-right'"></i>
        </div>
        <div class="min-w-0 flex items-center gap-2">
          <p class="truncate text-sm font-bold text-slate-800">{{ t('model.rooms.sensors.title') }}</p>
        </div>
      </div>

      <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
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
        <div class="max-h-48 overflow-y-auto overflow-x-hidden custom-scrollbar p-2 space-y-2">
          
          <div class="rounded-lg border border-slate-200 bg-white p-2">
            <div class="flex gap-3 items-end">
              
              <div class="flex-1 grid grid-cols-1 gap-2">
                <div class="min-w-0 w-full">
                  <label class="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block truncate">
                    {{ t('model.rooms.sensors.sensorId') }}
                  </label>
                  <input
                    v-model="sensorId"
                    type="text"
                    class="w-full bg-transparent border-b border-slate-200 focus:border-emerald-500 outline-none py-0.5 text-slate-800 font-semibold text-xs placeholder:text-slate-400 transition-colors"
                    :placeholder="t('model.rooms.sensors.sensorIdPlaceholder')"
                  />
                </div>

                <div class="min-w-0 w-full">
                  <label class="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block truncate">
                    {{ t('model.rooms.sensors.sensorType') }}
                  </label>
                  <select
                    v-model="sensorType"
                    class="w-full bg-transparent border-b border-slate-200 focus:border-emerald-500 outline-none py-0.5 text-slate-800 font-semibold text-xs truncate"
                  >
                    <option value="temperature">
                      {{ t('model.rooms.sensors.types.temperature') }}
                    </option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                class="shrink-0 flex items-center justify-center h-8 w-8 rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!sensorId.trim()"
                @click="handleRegisterSensor"
                :title="t('model.rooms.sensors.add')"
              >
                <i class="ph-bold ph-plus text-sm"></i>
              </button>

            </div>
          </div>

          <p v-if="error" class="text-[11px] font-semibold text-rose-500 px-1">{{ t('model.rooms.sensors.error') }}</p>
          <p v-if="actionError" class="text-[11px] font-semibold text-rose-500 px-1">{{ actionError }}</p>
          <p v-else-if="isLoading" class="text-[11px] font-semibold text-slate-500 px-1">
            {{ t('model.rooms.sensors.loading') }}
          </p>

          <div v-if="sensors.length > 0" class="space-y-1.5">
            <div
              v-for="sensor in sensors"
              :key="sensor.sensorId"
              class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 flex items-center justify-between gap-2"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-bold text-slate-800" :title="sensor.sensorId">{{ sensor.sensorId }}</p>
              </div>
              <span class="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                {{ t('model.rooms.sensors.types.temperature') }}
              </span>
              <div class="shrink-0 flex items-center gap-1 border-l border-slate-100 pl-2">
                <button
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
                  title="Decrease"
                  @click.stop="handleSendAction(
                    sensor.sensorId, 
                    sensor.sensorType,
                    'decrease',
                    ['1'])"
                >
                  <i class="ph-bold ph-minus text-[10px]"></i>
                </button>
                
                <button
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
                  title="Increase"
                  @click.stop="handleSendAction(
                    sensor.sensorId, 
                    sensor.sensorType,
                    'increase',
                    ['1'])"
                >
                  <i class="ph-bold ph-plus text-[10px]"></i>
                </button>
              </div>
            </div>
          </div>

          <p v-else-if="!isLoading" class="text-[11px] text-slate-400 px-1">
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

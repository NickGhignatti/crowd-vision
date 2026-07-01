<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBuildingDraft } from '@/composables/building/useBuildingDraft.ts'
import UploadZoneButton from '@/components/buttons/UploadZoneButton.vue'
import FullWidthInput from '@/components/inputs/FullWidthInput.vue'
import RangeSlider from '@/components/inputs/RangeSlider.vue'
import BuildingRoomCard from '@/components/cards/BuildingRoomCard.vue'
import type { RoomDraft, SensorRegistrationDraft } from '@/models/buildingDraft.ts'

const props = defineProps<{
  isOpen: boolean
  domainName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const { draft, hasData, isSubmitting, loadFromJson, updateBuilding, updateRoom, clear, submit } =
  useBuildingDraft()

const parseError = ref<string | null>(null)
const cosmeticBuildingAqiMin = ref(0)
const sensorDrafts = ref<SensorRegistrationDraft[]>([])
const roomSensorDrafts = computed(() => {
  const grouped: Record<string, Array<{ sensor: SensorRegistrationDraft; index: number }>> = {}

  sensorDrafts.value.forEach((sensor, index) => {
    if (!grouped[sensor.roomId]) {
      grouped[sensor.roomId] = []
    }
    grouped[sensor.roomId]!.push({ sensor, index })
  })

  return grouped
})

const hasInvalidSensorConfig = computed(() =>
  sensorDrafts.value.some((sensor) => !sensor.sensorId.trim() || !sensor.roomId.trim()),
)

const canSave = computed(() => hasData.value && !isSubmitting.value && !hasInvalidSensorConfig.value)

const handleFileSelected = async (file: File) => {
  parseError.value = null
  try {
    const raw = JSON.parse(await file.text())
    loadFromJson(raw)
    sensorDrafts.value = []
  } catch {
    parseError.value = t('model.register.invalidJson')
  }
}

const handleRoomUpdate = (roomId: string, patch: Partial<RoomDraft>) => {
  updateRoom(roomId, patch)
}

const handleAddSensorForRoom = (roomId: string) => {
  sensorDrafts.value.push({
    roomId,
    sensorId: '',
    sensorType: 'temperature',
  })
}

const handleRemoveSensor = (sensorIndex: number) => {
  sensorDrafts.value.splice(sensorIndex, 1)
}

const updateSensor = (sensorIndex: number, patch: Partial<SensorRegistrationDraft>) => {
  const sensor = sensorDrafts.value[sensorIndex]
  if (!sensor) return
  sensorDrafts.value[sensorIndex] = { ...sensor, ...patch }
}

const handleSave = async () => {
  if (!canSave.value) return

  await submit(props.domainName, sensorDrafts.value)
  sensorDrafts.value = []
  clear()
  emit('close')
}

const handleCancel = () => {
  sensorDrafts.value = []
  clear()
  parseError.value = null
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans"
      >
        <div
          class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          @click="handleCancel"
        ></div>

        <div
          class="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
          @click.stop
        >
          <!-- Header -->
          <div
            class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50 shrink-0"
          >
            <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
              <i class="ph-bold ph-buildings text-emerald-600"></i>
              {{ t('model.register.title') }}
            </h3>
            <button
              @click="handleCancel"
              class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
            >
              <i class="ph-bold ph-x text-xl"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="overflow-y-auto flex-1 p-6 space-y-6">
            <UploadZoneButton
              icon="ph-upload-simple"
              :title="t('model.register.uploadJson')"
              :is-uploading="isSubmitting"
              @file-selected="handleFileSelected"
            />

            <p
              v-if="parseError"
              class="text-xs text-rose-500 font-semibold flex items-center gap-1.5"
            >
              <i class="ph-bold ph-warning-circle"></i>
              {{ parseError }}
            </p>

            <template v-if="hasData && draft">
              <!-- Building name -->
              <div class="flex items-center gap-4">
                <label class="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  {{ t('model.register.buildingName') }}
                </label>
                <FullWidthInput
                  :model-value="draft.name"
                  :placeholder="t('model.register.buildingNamePlaceholder')"
                  @update:model-value="updateBuilding({ name: $event })"
                />
              </div>

              <!-- Building temperature -->
              <div class="space-y-2">
                <label
                  class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <i class="ph-bold ph-thermometer-hot text-rose-400"></i>
                  {{ t('model.register.temperature') }}
                </label>
                <RangeSlider
                  :min="0"
                  :max="50"
                  :min-value="draft.thresholds.minTemp"
                  :max-value="draft.thresholds.maxTemp"
                  unit="°C"
                  active-color="#f43f5e"
                  @update:min-value="
                    updateBuilding({ thresholds: { ...draft!.thresholds, minTemp: $event } })
                  "
                  @update:max-value="
                    updateBuilding({ thresholds: { ...draft!.thresholds, maxTemp: $event } })
                  "
                />
              </div>

              <!-- Building AQI -->
              <div class="space-y-2">
                <label
                  class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <i class="ph-bold ph-wind text-blue-400"></i>
                  {{ t('model.register.indoorAqi') }}
                </label>
                <RangeSlider
                  :min="0"
                  :max="200"
                  :min-value="cosmeticBuildingAqiMin"
                  :max-value="draft.thresholds.maxAqi"
                  unit="%"
                  active-color="#3b82f6"
                  @update:min-value="cosmeticBuildingAqiMin = $event"
                  @update:max-value="
                    updateBuilding({ thresholds: { ...draft!.thresholds, maxAqi: $event } })
                  "
                />
              </div>

              <!-- Rooms -->
              <div class="space-y-3">
                <label
                  class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <i class="ph-bold ph-door text-slate-400"></i>
                  {{ t('model.register.rooms') }}
                </label>
                <div class="space-y-3 max-h-72 overflow-y-auto pr-1">
                  <div v-for="room in draft.rooms" :key="room.id" class="space-y-3">
                    <BuildingRoomCard :room="room" @update="handleRoomUpdate(room.id, $event)" />

                    <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <label
                          class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"
                        >
                          <i class="ph-bold ph-cpu text-indigo-400"></i>
                          {{ t('model.register.sensors.title') }}
                        </label>
                        <button
                          type="button"
                          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
                          @click="handleAddSensorForRoom(room.id)"
                        >
                          <i class="ph-bold ph-plus"></i>
                          {{ t('model.register.sensors.add') }}
                        </button>
                      </div>

                      <p class="text-xs text-slate-500">
                        {{ t('model.register.sensors.hint') }}
                      </p>

                      <div v-if="roomSensorDrafts[room.id]?.length" class="space-y-3">
                        <div
                          v-for="{ sensor, index: sensorIndex } in roomSensorDrafts[room.id]"
                          :key="`${room.id}-${sensor.sensorType}-${sensorIndex}`"
                          class="grid grid-cols-1 md:grid-cols-[1fr_170px_auto] gap-3 items-end border border-slate-200 rounded-xl p-3 bg-white"
                        >
                          <div>
                            <label class="text-xs font-semibold text-slate-500">
                              {{ t('model.register.sensors.sensorId') }}
                            </label>
                            <FullWidthInput
                              :model-value="sensor.sensorId"
                              :placeholder="t('model.register.sensors.sensorIdPlaceholder')"
                              @update:model-value="updateSensor(sensorIndex, { sensorId: $event })"
                            />
                          </div>

                          <div>
                            <label class="text-xs font-semibold text-slate-500">
                              {{ t('model.register.sensors.type') }}
                            </label>
                            <select
                              :value="sensor.sensorType"
                              class="w-full bg-white border-b-2 border-slate-200 focus:border-emerald-500 outline-none py-1.5 text-slate-800 font-semibold text-sm"
                              @change="
                                updateSensor(sensorIndex, {
                                  sensorType: ($event.target as HTMLSelectElement).value as 'temperature',
                                })
                              "
                            >
                              <option value="temperature">
                                {{ t('model.register.sensors.types.temperature') }}
                              </option>
                            </select>
                          </div>

                          <button
                            type="button"
                            class="inline-flex items-center justify-center p-2 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors"
                            :aria-label="t('model.register.sensors.remove')"
                            @click="handleRemoveSensor(sensorIndex)"
                          >
                            <i class="ph-bold ph-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p v-if="hasInvalidSensorConfig" class="text-xs text-rose-500 font-semibold">
                  {{ t('model.register.sensors.invalidConfig') }}
                </p>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div
            class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0"
          >
            <button
              @click="handleCancel"
              class="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded-xl transition-colors"
            >
              {{ t('commons.cancel') }}
            </button>
            <button
              :disabled="!canSave"
              class="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-lg shadow-emerald-600/20 rounded-xl transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              @click="handleSave"
            >
              <i
                :class="isSubmitting ? 'ph-bold ph-spinner animate-spin' : 'ph-bold ph-check'"
              ></i>
              {{ isSubmitting ? t('model.register.saving') : t('commons.save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

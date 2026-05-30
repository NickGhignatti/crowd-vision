<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBuildingDraft } from '@/composables/building/useBuildingDraft.ts'
import UploadZoneButton from '@/components/buttons/UploadZoneButton.vue'
import FullWidthInput from '@/components/inputs/FullWidthInput.vue'
import RangeSlider from '@/components/inputs/RangeSlider.vue'
import BuildingRoomCard from '@/components/cards/BuildingRoomCard.vue'
import type { RoomDraft } from '@/models/buildingDraft.ts'

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

const handleFileSelected = async (file: File) => {
  parseError.value = null
  try {
    const raw = JSON.parse(await file.text())
    loadFromJson(raw)
  } catch {
    parseError.value = t('model.register.invalidJson')
  }
}

const handleRoomUpdate = (roomId: string, patch: Partial<RoomDraft>) => {
  updateRoom(roomId, patch)
}

const handleSave = async () => {
  await submit(props.domainName)
  clear()
  emit('close')
}

const handleCancel = () => {
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
                    updateBuilding({ thresholds: { ...draft.thresholds, minTemp: $event } })
                  "
                  @update:max-value="
                    updateBuilding({ thresholds: { ...draft.thresholds, maxTemp: $event } })
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
                    updateBuilding({ thresholds: { ...draft.thresholds, maxAqi: $event } })
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
                  <BuildingRoomCard
                    v-for="room in draft.rooms"
                    :key="room.id"
                    :room="room"
                    @update="handleRoomUpdate(room.id, $event)"
                  />
                </div>
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
              :disabled="!hasData || isSubmitting"
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

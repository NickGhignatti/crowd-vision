<script setup lang="ts">
import EditRoomModal from '@/components/modals/editing/EditRoomModal.vue'
import ShortSearchInput from '@/components/inputs/search/ShortSearchInput.vue'
import RoomCard from '@/components/cards/RoomCard.vue'
import RoomSensorsPanel from '@/components/selectors/RoomSensorsPanel.vue'
import CollapsiblePanel from '@/components/panels/CollapsiblePanel.vue'
import PanelHeader from '@/components/panels/PanelHeader.vue'
import type { Building, Room } from '@/models/building.ts'
import { useUserPermissions } from '@/composables/auth/useUserPermissions.ts'
import { useI18n } from 'vue-i18n'
import { getBuildingData, useBuildingSensors, type RoomSensorRecord } from '@/composables/building/useSensorData.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { ref, computed, nextTick, watch } from 'vue'

export interface RoomItemBody {
  room: Room
  temp: number | undefined
  people: number | undefined
  indoorAqi: number | undefined
}

const props = defineProps<{
  buildingModel: Building | null
  selectedRoomId: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-select', id: string): void
}>()

const { t } = useI18n()
const { canEdit } = useUserPermissions()
const buildingsStore = useBuildingsStore()

// A v-model (not a local ref) so ModelView can shift its own floating panels
// (the edit toolbar) clear of CollapsiblePanel's reopen button, which occupies
// the same top-right corner once this panel is collapsed.
const isRightOpen = defineModel<boolean>('open', { default: true })
const searchQuery = ref('')
const searchBar = ref<InstanceType<typeof ShortSearchInput> | null>(null)
const isEditModalOpen = ref(false)
const editingRoom = ref<Room | null>(null)
const roomRefs = ref<Record<string, HTMLElement | null>>({})

const userCanEdit = computed(() =>
  props.buildingModel ? canEdit(props.buildingModel.domains) : false,
)

const filteredRooms = computed(() => {
  if (!props.buildingModel?.rooms) return []
  if (!searchQuery.value) return props.buildingModel.rooms
  const query = searchQuery.value.toLowerCase()
  return props.buildingModel.rooms.filter(
    (room) => room.id.toLowerCase().includes(query) || room.name.toLowerCase().includes(query),
  )
})

watch(
  () => props.selectedRoomId,
  async (newId) => {
    if (newId && roomRefs.value[newId]) {
      await nextTick()
      roomRefs.value[newId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  },
)

const buildingId = computed(() => props.buildingModel?.id)
const { data: peopleData } = getBuildingData(buildingId, 'peopleCount')
const { data: temperatures } = getBuildingData(buildingId, 'temperature')
const { data: airQuality } = getBuildingData(buildingId, 'airQuality')
const { 
  sensors: buildingSensors, 
  isLoading: sensorsLoading, 
  error: sensorsError, 
  registerSensor, 
  sendAction 
} = useBuildingSensors(buildingId)

const sensorsByRoom = computed<Record<string, RoomSensorRecord[]>>(() => {
  const grouped: Record<string, RoomSensorRecord[]> = {}

  for (const sensor of buildingSensors.value) {
    if (!grouped[sensor.roomId]) grouped[sensor.roomId] = []
    grouped[sensor.roomId]!.push(sensor)
  }

  return grouped
})

const enrichedRooms = computed<RoomItemBody[]>(() => {
  if (!props.buildingModel) return []
  return filteredRooms.value.map((room) => ({
    room,
    temp: temperatures.value?.find((t: any) => t.roomId === room.id)?.value,
    people: peopleData.value?.find((p: any) => p.roomId === room.id)?.value,
    indoorAqi:
      airQuality.value?.find((a: any) => a.roomId === room.id)?.indoor_aqi ??
      airQuality.value?.find((a: any) => a.roomId === room.id)?.indoorAqi,
  }))
})

const handleOpenEdit = (room: Room) => {
  editingRoom.value = room
  isEditModalOpen.value = true
}

const saveRoomConfig = async (updates: Partial<Room>) => {
  if (!props.buildingModel || !editingRoom.value) return
  try {
    await buildingsStore.updateRoomConfig(props.buildingModel.id, editingRoom.value.id, updates)
    Object.assign(editingRoom.value, updates)
    isEditModalOpen.value = false
  } catch (e) {
    console.error(e)
    alert(t('model.rooms.updateFailed'))
  }
}
</script>

<template>
  <CollapsiblePanel v-model="isRightOpen" side="right">
    <PanelHeader :title="t('model.roomList')" side="right" @toggle="isRightOpen = false">
      <template #title>
        <h2
          v-show="!searchBar?.isOpen"
          class="text-lg font-bold text-slate-800 whitespace-nowrap transition-opacity duration-200"
        >
          {{ t('model.roomList') }}
        </h2>
      </template>
      <template #search>
        <ShortSearchInput
          ref="searchBar"
          v-model="searchQuery"
          :placeholder="`${t('commons.search')} ${t('model.rooms.editRoom.name')}...`"
        />
      </template>
    </PanelHeader>

    <div class="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
      <div class="space-y-4">
        <div v-if="!buildingModel?.rooms?.length" class="text-center py-10">
          <p class="text-slate-400 text-sm">{{ t('model.noRooms') }}</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="r in enrichedRooms"
            :key="r.room.id"
            :ref="(el) => (roomRefs[r.room.id] = el as HTMLElement)"
            class="space-y-2"
          >
            <div
              class="space-y-0.5 bg-slate-50 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden"
              >
              <RoomCard
                :room="r.room"
                :is-selected="selectedRoomId === r.room.id"
                :can-edit="userCanEdit"
                :temp="r.temp"
                :people="r.people"
                :indoor-aqi="r.indoorAqi"
                @select="emit('toggle-select', $event)"
                @edit="handleOpenEdit"
              />

              <RoomSensorsPanel v-if="userCanEdit"
                :room-id="r.room.id"
                :room-name="r.room.name"
                :sensors="sensorsByRoom[r.room.id] ?? []"
                :is-loading="sensorsLoading"
                :error="sensorsError"
                :on-register-sensor="registerSensor"
                :on-send-action="sendAction"
              />
            </div>
          </div>

          <div v-if="filteredRooms.length === 0" class="text-center py-4">
            <p class="text-slate-400 text-xs">{{ t('model.noRooms') }}</p>
          </div>
        </div>
      </div>
    </div>
  </CollapsiblePanel>

  <EditRoomModal
    :is-open="isEditModalOpen"
    :room="editingRoom"
    @close="isEditModalOpen = false"
    @save="saveRoomConfig"
  />
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

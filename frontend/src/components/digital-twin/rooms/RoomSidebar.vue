<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Building, Room } from '@/models/building.ts'
import { filterRooms } from '@/utils/building/buildings.ts'
import { getBuildingData } from '@/composables/building/useSensorData.ts'
import type { ApiDataPoint } from '@/composables/building/useSensorData.ts'
import { useUserPermissions } from '@/composables/auth/useUserPermissions.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import SidePanel from '@/components/digital-twin/sidebar/SidePanel.vue'
import RoomListItem from '@/components/digital-twin/rooms/RoomListItem.vue'
import EditRoomModal from '@/components/digital-twin/modals/EditRoomModal.vue'
import SearchInput from '@/components/commons/forms/SearchInput.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'

const props = defineProps<{ building: Building | null; selectedRoomId: string | null }>()

const emit = defineEmits<{ select: [roomId: string] }>()

const { t } = useI18n()
const { canEdit } = useUserPermissions()
const buildingsStore = useBuildingsStore()

const query = ref('')
const editingRoom = ref<Room | null>(null)
const editError = ref<string | null>(null)
const itemRefs = new Map<string, Element>()

const buildingId = computed(() => props.building?.id)
const userCanEdit = computed(() => (props.building ? canEdit(props.building.domains) : false))
const rooms = computed(() => filterRooms(props.building?.rooms ?? [], query.value))

const { data: people } = getBuildingData(buildingId, 'peopleCount')
const { data: temperatures } = getBuildingData(buildingId, 'temperature')
const { data: airQuality } = getBuildingData(buildingId, 'airQuality')

const byRoom = (points: ApiDataPoint[], read: (point: ApiDataPoint) => number | undefined) =>
  new Map(points.map((point) => [point.roomId, read(point)]))

const readings = computed(() => ({
  people: byRoom(people.value ?? [], (p) => p.value),
  temperature: byRoom(temperatures.value ?? [], (p) => p.value),
  airQuality: byRoom(airQuality.value ?? [], (p) => p.indoor_aqi ?? p.indoorAqi),
}))

watch(
  () => props.selectedRoomId,
  async (id) => {
    if (!id) return
    await nextTick()
    itemRefs.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  },
)

const openEditor = (room: Room) => {
  editError.value = null
  editingRoom.value = room
}

const saveThreshold = async (maxTemperature: number) => {
  if (!props.building || !editingRoom.value) return
  try {
    await buildingsStore.updateRoomThreshold(
      props.building.id,
      editingRoom.value.id,
      maxTemperature,
    )
    editingRoom.value.maxTemperature = maxTemperature
    editingRoom.value = null
  } catch (error) {
    console.error(error)
    editError.value = t('model.rooms.updateFailed')
  }
}
</script>

<template>
  <SidePanel side="right" icon="door" :title="t('model.roomList')">
    <template #toolbar>
      <SearchInput
        v-model="query"
        size="sm"
        :placeholder="`${t('commons.search')} ${t('model.rooms.editRoom.name')}…`"
      />
    </template>

    <EmptyState v-if="rooms.length === 0" compact icon="door" :title="t('model.noRooms')" />

    <div class="space-y-2.5">
      <div
        v-for="room in rooms"
        :key="room.id"
        :ref="(el) => (el ? itemRefs.set(room.id, el as Element) : itemRefs.delete(room.id))"
      >
        <RoomListItem
          :room="room"
          :selected="selectedRoomId === room.id"
          :can-edit="userCanEdit"
          :temperature="readings.temperature.get(room.id)"
          :people="readings.people.get(room.id)"
          :air-quality="readings.airQuality.get(room.id)"
          @select="emit('select', room.id)"
          @edit="openEditor(room)"
        />
      </div>
    </div>
  </SidePanel>

  <EditRoomModal
    :open="!!editingRoom"
    :room="editingRoom"
    :error="editError"
    @close="editingRoom = null"
    @save="saveThreshold"
  />
</template>

<script setup lang="ts">
import EditRoom from '@/components/modals/EditRoom.vue'
import RoomCard from '@/components/cards/RoomCard.vue'
import RoomSearchBar from '@/components/inputs/SearchBar.vue'
import type { Building, Room } from '@/models/building'
import { useUserPermissions } from '@/composables/useUserPermissions'

import { ref, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { makeRequest } from '@/composables/useApi.ts'
import { getBuildingData } from '@/composables/useSensorData'

export interface RoomItemBody {
  room: Room
  temp: number | undefined
  people: number | undefined
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

const userCanEdit = computed(() =>
  props.buildingModel ? canEdit(props.buildingModel.domains) : false,
)

const isRightOpen = ref(true)
const toggleRight = () => (isRightOpen.value = !isRightOpen.value)

const searchQuery = ref('')
const searchBar = ref<InstanceType<typeof RoomSearchBar> | null>(null)

const isEditModalOpen = ref(false)
const editingRoom = ref<Room | null>(null)
const roomRefs = ref<Record<string, HTMLElement | null>>({})

const filteredRooms = computed(() => {
  if (!props.buildingModel?.rooms) return []
  if (!searchQuery.value) return props.buildingModel.rooms
  const query = searchQuery.value.toLowerCase()
  return props.buildingModel.rooms.filter((room) => {
    return room.id.toLowerCase().includes(query) || room.name.toLowerCase().includes(query)
  })
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

const {
  data: peopleData,
} = getBuildingData(buildingId, 'peopleCount')

const {
  data: temperatures,
} = getBuildingData(buildingId, 'temperature')

const enrichedRooms = computed<RoomItemBody[]>(() => {
  if (!props.buildingModel) return []

  return filteredRooms.value.map((room) => {
    const roomTempData = temperatures.value?.find(
      (t: any) => t.roomId === room.id
    )
    const roomPeople = peopleData.value?.find(
      (p: any) => p.roomId === room.id
    )

    return {
      room,
      temp: roomTempData?.value,
      people: roomPeople?.value
    }
  })
})

const handleOpenEdit = (room: Room) => {
  editingRoom.value = room
  isEditModalOpen.value = true
}

const saveRoomConfig = async (updates: Partial<Room>) => {
  if (!props.buildingModel || !editingRoom.value) return
  try {
    const response = await makeRequest(
      `/twin/building/${props.buildingModel.id}/room/${editingRoom.value.id}`,
      'PATCH',
      { body: JSON.stringify(updates) },
    )
    if (!response.ok) {
      alert(t('model.rooms.updateFailed'))
      return
    }
    Object.assign(editingRoom.value, updates)
  } catch (e) {
    console.error(e)
    alert(t('model.rooms.updateFailed'))
  }
}
</script>

<template>
  <aside
    class="bg-white border-l border-slate-200 transition-all duration-300 ease-in-out flex flex-col relative z-30 shadow-sm"
    :class="isRightOpen ? 'w-80' : 'w-0 overflow-hidden border-none'"
  >
    <div class="h-full flex flex-col w-80">
      <!-- Header -->
      <div class="px-6 pt-6 pb-2 shrink-0 bg-white border-b border-transparent z-10">
        <div class="flex justify-between items-center h-10 mb-4">
          <div class="flex items-center flex-1 overflow-hidden">
            <h2
              v-show="!searchBar?.isOpen"
              class="text-lg font-bold text-slate-800 whitespace-nowrap mr-3 transition-opacity duration-200"
            >
              {{ t('model.roomList') }}
            </h2>
            <SearchBar
              ref="searchBar"
              v-model="searchQuery"
              :placeholder="`${t('commons.search')} ${t('model.rooms.editRoom.name')}...`"
            />
          </div>

          <button
            @click="toggleRight"
            class="text-slate-400 hover:text-emerald-600 transition-colors p-1 ml-1"
          >
            <i class="ph-bold ph-caret-right text-xl"></i>
          </button>
        </div>
      </div>

      <!-- Room list -->
      <div class="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
        <div class="space-y-4">
          <div
            v-if="!props.buildingModel || props.buildingModel.rooms.length === 0"
            class="text-center py-10"
          >
            <p class="text-slate-400 text-sm">{{ t('model.noRooms') }}</p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="r in enrichedRooms"
              :key="r.room.id"
              :ref="(el) => (roomRefs[r.room.id] = el as HTMLElement)"
            >
              <RoomCard
                :room="r.room"
                :is-selected="props.selectedRoomId === r.room.id"
                :can-edit="userCanEdit"
                :temp=r.temp
                :people=r.people
                @select="emit('toggle-select', $event)"
                @edit="handleOpenEdit"
              />
            </div>

            <div v-if="filteredRooms.length === 0" class="text-center py-4">
              <p class="text-slate-400 text-xs">{{ t('model.noRooms') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>

  <EditRoom
    :is-open="isEditModalOpen"
    :room="editingRoom"
    @close="isEditModalOpen = false"
    @save="saveRoomConfig"
  />

  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 translate-x-2"
    enter-to-class="opacity-100 translate-x-0"
  >
    <button
      v-if="!isRightOpen"
      @click="toggleRight"
      class="absolute right-6 top-4 z-40 bg-white p-2 rounded-lg shadow-lg border border-slate-200 text-slate-600 hover:text-emerald-600 hover:scale-105 transition-all"
      :title="t('commons.open')"
    >
      <i class="ph-bold ph-caret-left text-xl"></i>
    </button>
  </Transition>
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

<script setup lang="ts">
import EditRoom from '@/components/modals/EditRoom.vue'
import RoomItem from '@/components/menus/components/RoomItem.vue'
import type { BuildingPayload, RoomPayload } from '@/models/building'
import { useUserPermissions } from '@/composables/useUserPermissions'

import { ref, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  building: BuildingPayload | null
  selectedRoomId: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-select', id: string): void
}>()

const { t } = useI18n()
const { canEdit } = useUserPermissions()

// Check if user is Admin/Owner for this specific building's domains
const userCanEdit = computed(() => {
  return props.building ? canEdit(props.building.domains) : false
})

const isRightOpen = ref(true)
const toggleRight = () => (isRightOpen.value = !isRightOpen.value)

const isSearchOpen = ref(false)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const isEditModalOpen = ref(false)
const editingRoom = ref<RoomPayload | null>(null)
const roomRefs = ref<Record<string, HTMLElement | null>>({})

const toggleSearch = () => {
  isSearchOpen.value = !isSearchOpen.value
  if (isSearchOpen.value) {
    searchQuery.value = ''
    nextTick(() => {
      searchInput.value?.focus()
    })
  } else {
    searchQuery.value = ''
  }
}

const filteredRooms = computed(() => {
  if (!props.building || !props.building.rooms) return []
  if (!searchQuery.value) return props.building.rooms

  const query = searchQuery.value.toLowerCase()
  return props.building.rooms.filter((room) => room.id.toLowerCase().includes(query))
})

watch(
  () => props.selectedRoomId,
  async (newId) => {
    if (newId && roomRefs.value[newId]) {
      await nextTick()
      roomRefs.value[newId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  },
)

const handleOpenEdit = (room: RoomPayload) => {
  editingRoom.value = room
  isEditModalOpen.value = true
}

const saveRoomConfig = async (updates: Partial<RoomPayload>) => {
  if (!props.building || !editingRoom.value) return

  try {
    const buildingId = props.building.id
    const roomId = editingRoom.value.id

    const res = await fetch(
      `${import.meta.env.VITE_SERVER_URL}/twin/building/${buildingId}/room/${roomId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
    )

    if (!res.ok) throw new Error('Update failed')

    Object.assign(editingRoom.value, updates)
  } catch (e) {
    console.error(e)
    alert('Failed to update room')
  }
}
</script>

<template>
  <aside
    class="bg-white border-l border-slate-200 transition-all duration-300 ease-in-out flex flex-col relative z-30 shadow-sm"
    :class="isRightOpen ? 'w-80' : 'w-0 overflow-hidden border-none'"
  >
    <div class="h-full flex flex-col w-80">
      <div class="px-6 pt-6 pb-2 shrink-0 bg-white border-b border-transparent z-10">
        <div class="flex justify-between items-center h-10 mb-4">
          <div class="flex items-center flex-1 overflow-hidden">
            <h2
              v-show="!isSearchOpen"
              class="text-lg font-bold text-slate-800 whitespace-nowrap mr-3 transition-opacity duration-200"
            >
              {{ t('model.roomList') }}
            </h2>

            <div
              class="flex items-center transition-all duration-300 ease-in-out"
              :class="isSearchOpen ? 'w-full bg-slate-100 rounded-md mr-2' : ''"
            >
              <button
                v-if="!isSearchOpen"
                @click="toggleSearch"
                class="text-slate-400 hover:text-emerald-600 transition-colors p-1"
                :title="t('model.searchRoom')"
              >
                <i class="ph-bold ph-magnifying-glass text-xl"></i>
              </button>

              <div v-else class="flex items-center w-full px-2 py-1">
                <i class="ph-bold ph-magnifying-glass text-slate-400 text-lg mr-2"></i>
                <input
                  ref="searchInput"
                  v-model="searchQuery"
                  type="text"
                  :placeholder="t('commons.search') + ' ' + t('commons.id') + '...'"
                  class="bg-transparent border-none outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
                  @keydown.esc="toggleSearch"
                />
                <button
                  @click="toggleSearch"
                  class="text-slate-400 hover:text-red-500 ml-1 flex-shrink-0"
                >
                  <i class="ph-bold ph-x text-lg"></i>
                </button>
              </div>
            </div>
          </div>

          <button
            @click="toggleRight"
            class="text-slate-400 hover:text-emerald-600 transition-colors p-1 ml-1"
          >
            <i class="ph-bold ph-caret-right text-xl"></i>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
        <div class="space-y-4">
          <div
            v-if="!props.building || props.building.rooms.length === 0"
            class="text-center py-10"
          >
            <p class="text-slate-400 text-sm">{{ t('model.RightMenu.missingRooms') }}</p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="room in filteredRooms"
              :key="room.id"
              :ref="(el) => (roomRefs[room.id] = el as HTMLElement)"
            >
              <RoomItem
                :room="room"
                :is-selected="props.selectedRoomId === room.id"
                :can-edit="userCanEdit"
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

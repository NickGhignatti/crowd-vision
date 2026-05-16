<script setup lang="ts">
import { getBuildingData } from '@/composables/building/useSensorData.ts'
import { computed, toRef, ref } from 'vue'
import { getStatusByOccupants } from '@/helpers/status'
import { useI18n } from 'vue-i18n'
import TableControls from '@/components/panels/TableControls.vue'
import { usePagination } from '@/composables/ui/usePagination.ts'
import { useAutoPlay } from '@/composables/scene/useAutoPlay.ts'
import StatusRecord from '@/components/records/StatusRecord.vue'
import DataRecord from '@/components/records/DataRecord.vue'
import EmptyRecord from '@/components/records/EmptyRecord.vue'
import { useUserPermissions } from '@/composables/auth/useUserPermissions.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'

export interface TableHeader {
  key: string
  label: string
  cellClass?: string
}

export interface TableBody {
  room: string
  roomId: string
  status: string
  teacher: string
  temp: string
  people: string
  capacity: string
  [key: string]: any
}

const props = withDefaults(
  defineProps<{
    headers: TableHeader[]
    roomsData: TableBody[]
    itemsPerPage?: number
    selectedBuildingId: string | undefined
  }>(),
  {
    itemsPerPage: 7,
  },
)

const buildingIdRef = toRef(props, 'selectedBuildingId')
const { t } = useI18n()
const userPermission = useUserPermissions()
const buildingStore = useBuildingsStore()
const hasEditPermission = computed(() =>
  userPermission.canEdit(buildingStore.getById(buildingIdRef.value!)?.domains || []),
)

// --- Edit Mode Logic ---
const isEditMode = ref(false)

// Placeholder functions for future column management
const handleColumnClick = (header: TableHeader) => {
  console.log('Action: Clicked/Edit column ->', header.key)
}

const handleDeleteColumn = (header: TableHeader) => {
  console.log('Action: Delete column ->', header.key)
}

const handleAddNew = () => {
  console.log('Action: Add new room/record/column')
}
// -----------------------

const { data: peopleData, isLoading: loadingPeople } = getBuildingData(buildingIdRef, 'peopleCount')
const { data: temperatures, isLoading: loadingTemperature } = getBuildingData(
  buildingIdRef,
  'temperature',
)

const enrichedItems = computed<TableBody[]>(() => {
  if (!props.roomsData) return []

  return props.roomsData.map((item) => {
    const roomTempData = temperatures.value?.find((t: any) => t.roomId === item.roomId)
    const roomPeople = peopleData.value?.find((p: any) => p.roomId === item.roomId)

    const peopleCount = roomPeople ? Number(roomPeople.value) : Number(item.people) || 0
    const capacityNum = Number(item.capacity) || 0

    return {
      ...item,
      temp: roomTempData ? `${roomTempData.value}°C` : item.temp,
      people: roomPeople ? `${roomPeople.value}` : item.people,
      status: getStatusByOccupants(peopleCount, capacityNum),
    }
  })
})

const { currentPage, totalPages, paginatedItems, emptyRows, nextPage, prevPage, goToFirst } =
  usePagination(enrichedItems, toRef(props, 'itemsPerPage'))

const { isAutoPlaying, toggleAutoPlay } = useAutoPlay(() => {
  if (currentPage.value < totalPages.value) nextPage()
  else goToFirst()
})
</script>

<template>
  <div
    class="w-full max-w-5xl bg-white rounded-2xl shadow-sm border border-slate-300 flex flex-col h-full overflow-hidden"
  >
    <div class="flex-1 min-h-0 overflow-auto bg-white relative">
      <table class="w-full text-left border-collapse">
        <thead class="bg-emerald-600 text-white sticky top-0 z-10 shadow-sm">
          <tr>
            <th
              v-for="header in headers"
              :key="header.key"
              class="font-semibold text-sm uppercase tracking-wide border-r border-emerald-500 last:border-r-0 whitespace-nowrap p-5 relative"
              :class="isEditMode ? 'cursor-pointer hover:bg-emerald-700 transition-colors' : ''"
              @click="isEditMode ? handleColumnClick(header) : undefined"
            >
              <div class="flex items-center h-full pr-4">
                <span>{{ t(header.label) }}</span>
              </div>

              <button
                v-if="isEditMode"
                @click.stop="handleDeleteColumn(header)"
                class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 hover:scale-110 transition-all shadow-sm z-20"
                title="Delete Column"
              >
                <i class="ph ph-x text-[10px] font-bold leading-none"></i>
              </button>
            </th>
          </tr>
        </thead>

        <tbody v-if="!buildingIdRef">
          <StatusRecord :colspan="headers.length" pulse> No data </StatusRecord>
        </tbody>

        <tbody v-else-if="loadingTemperature || loadingPeople">
          <StatusRecord :colspan="headers.length" pulse>
            {{ t('model.loading') }}
          </StatusRecord>
        </tbody>

        <tbody v-else>
          <DataRecord
            v-for="(item, index) in paginatedItems"
            :key="index"
            :item="item"
            :headers="headers"
          >
            <template v-for="header in headers" :key="header.key" #[header.key]="slotProps">
              <slot :name="header.key" v-bind="slotProps" />
            </template>
          </DataRecord>

          <EmptyRecord :count="emptyRows" :headers="headers" />

          <StatusRecord v-if="paginatedItems.length === 0" :colspan="headers.length">
            {{ t('dashboard.table.noDataAvailable') }}
          </StatusRecord>
        </tbody>
      </table>
    </div>

    <TableControls
      class="shrink-0 border-t border-slate-300"
      :current-page="currentPage"
      :total-pages="totalPages"
      :is-auto-playing="isAutoPlaying"
      :can-edit="hasEditPermission"
      :is-edit-mode="isEditMode"
      @toggle-auto-play="toggleAutoPlay"
      @prev-page="prevPage"
      @next-page="nextPage"
      @toggle-edit="isEditMode = !isEditMode"
      @add-new="handleAddNew"
    />
  </div>
</template>

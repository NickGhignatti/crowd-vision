<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { getBuildingData } from '@/composables/building/useSensorData.ts'
import { usePagination } from '@/composables/ui/usePagination.ts'
import { useAutoPlay } from '@/composables/scene/useAutoPlay.ts'
import { useUserPermissions } from '@/composables/auth/useUserPermissions.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { useColumnManager } from '@/composables/building/useColumnManager.ts'
import { getStatusByOccupants } from '@/helpers/status'
import TableControls from '@/components/panels/TableControls.vue'
import AddColumnPanel from '@/components/panels/AddColumnPanel.vue'
import ColumnSwapDropdown from '@/components/panels/ColumnSwapDropdown.vue'
import BuildingTableHead from '@/components/tables/BuildingTableHead.vue'
import StatusRecord from '@/components/records/StatusRecord.vue'
import DataRecord from '@/components/records/DataRecord.vue'
import EmptyRecord from '@/components/records/EmptyRecord.vue'
import type { TableHeader, TableBody } from '@/models/table.ts'

export type { TableHeader, TableBody }

// ── Props / Emits ───────────────────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    headers: TableHeader[]
    roomsData: TableBody[]
    itemsPerPage?: number
    selectedBuildingId: string | undefined
  }>(),
  { itemsPerPage: 7 },
)

const emit = defineEmits<{
  'headers-updated': [headers: TableHeader[]]
}>()

// ── Core setup ──────────────────────────────────────────────────────────────

const { t }           = useI18n()
const buildingIdRef   = toRef(props, 'selectedBuildingId')
const userPermission  = useUserPermissions()
const buildingStore   = useBuildingsStore()

const hasEditPermission = computed(() =>
  userPermission.canEdit(buildingStore.getById(buildingIdRef.value!)?.domains ?? []),
)

// ── Column management ───────────────────────────────────────────────────────

const {
  localHeaders,
  isEditMode,
  isSavingPreferences,
  isFetchingMetrics,
  activeHeaderKey,
  dropdownPos,
  showAddPanel,
  addableMetrics,
  swappableMetrics,
  activeHeader,
  handleColumnClick,
  handleDeleteColumn,
  handleSwapColumn,
  handleAddColumn,
  handleAddNew,
  savePreferences,
  cancelEdit,
} = useColumnManager(
  toRef(props, 'headers'),
  buildingIdRef,
  (updated) => emit('headers-updated', updated),
)

// ── Sensor data ─────────────────────────────────────────────────────────────

const { data: peopleData,   isLoading: loadingPeople      } = getBuildingData(buildingIdRef, 'peopleCount')
const { data: temperatures, isLoading: loadingTemperature  } = getBuildingData(buildingIdRef, 'temperature')
const { data: airQualityData                                } = getBuildingData(buildingIdRef, 'airQuality')

const enrichedItems = computed<TableBody[]>(() => {
  if (!props.roomsData) return []

  return props.roomsData.map(item => {
    const roomTemp   = temperatures.value?.find((t: any) => t.roomId === item.roomId)
    const roomPeople = peopleData.value?.find((p: any)   => p.roomId === item.roomId)
    const roomAQ     = airQualityData.value?.find((a: any) => a.roomId === item.roomId)

    const peopleCount = roomPeople ? Number(roomPeople.value) : Number(item.people) || 0
    const capacityNum = Number(item.capacity) || 0

    return {
      ...item,
      temp:      roomTemp   ? `${roomTemp.value}°C`                    : item.temp,
      people:    roomPeople ? `${roomPeople.value}`                     : item.people,
      indoorAqi: roomAQ     ? `${(roomAQ.indoor_aqi ?? 0).toFixed(1)}` : '--',
      status:    getStatusByOccupants(peopleCount, capacityNum),
    }
  })
})

// ── Pagination & Autoplay ───────────────────────────────────────────────────

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
    <!-- Add-Column Panel -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <AddColumnPanel
        v-if="showAddPanel && isEditMode"
        :metrics="addableMetrics"
        :is-fetching="isFetchingMetrics"
        @select="handleAddColumn"
        @close="showAddPanel = false"
      />
    </Transition>

    <!-- Table -->
    <div class="flex-1 min-h-0 overflow-auto bg-white relative">
      <table class="w-full text-left border-collapse">

        <BuildingTableHead
          :headers="localHeaders"
          :is-edit-mode="isEditMode"
          :active-header-key="activeHeaderKey"
          @column-click="handleColumnClick"
          @delete-column="handleDeleteColumn"
          @add-new="handleAddNew"
        />

        <tbody v-if="!buildingIdRef">
          <StatusRecord :colspan="localHeaders.length + (isEditMode ? 1 : 0)" pulse>
            {{ t('dashboard.table.noData') }}
          </StatusRecord>
        </tbody>

        <tbody v-else-if="loadingTemperature || loadingPeople">
          <StatusRecord :colspan="localHeaders.length + (isEditMode ? 1 : 0)" pulse>
            {{ t('model.loading') }}
          </StatusRecord>
        </tbody>

        <tbody v-else>
          <DataRecord
            v-for="(item, index) in paginatedItems"
            :key="index"
            :item="item"
            :headers="localHeaders"
          >
            <template
              v-for="header in localHeaders"
              :key="header.key"
              #[header.key]="slotProps"
            >
              <slot :name="header.key" v-bind="slotProps" />
            </template>
          </DataRecord>

          <EmptyRecord :count="emptyRows" :headers="localHeaders" />

          <StatusRecord
            v-if="paginatedItems.length === 0"
            :colspan="localHeaders.length + (isEditMode ? 1 : 0)"
          >
            {{ t('dashboard.table.noDataAvailable') }}
          </StatusRecord>
        </tbody>

      </table>
    </div>

    <!-- Controls -->
    <TableControls
      class="shrink-0 border-t border-slate-300"
      :current-page="currentPage"
      :total-pages="totalPages"
      :is-auto-playing="isAutoPlaying"
      :can-edit="hasEditPermission"
      :is-edit-mode="isEditMode"
      :is-saving="isSavingPreferences"
      @toggle-auto-play="toggleAutoPlay"
      @prev-page="prevPage"
      @next-page="nextPage"
      @toggle-edit="isEditMode = !isEditMode"
      @add-new="handleAddNew"
      @save="savePreferences"
      @cancel="cancelEdit"
    />
  </div>

  <!-- Swap Dropdown -->
  <ColumnSwapDropdown
    :visible="!!activeHeaderKey && isEditMode"
    :active-header="activeHeader"
    :metrics="swappableMetrics"
    :is-fetching="isFetchingMetrics"
    :position="dropdownPos"
    @swap="handleSwapColumn"
    @close="activeHeaderKey = null"
  />
</template>

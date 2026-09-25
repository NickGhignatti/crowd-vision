<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import type { TableBody } from '@/types/dashboard/table.ts'
import { metricKeyToHeader } from '@/utils/dashboard/metrics.ts'
import { buildRows, sensorKinds } from '@/utils/dashboard/tableRows.ts'
import { filterRows, type RowFilter } from '@/utils/dashboard/dashboard.ts'
import { useBuildingReadings } from '@/composables/dashboard/useBuildingSensor.ts'
import { useColumnManager } from '@/composables/dashboard/useColumnManager.ts'
import { useUserPermissions } from '@/composables/authentication/useUserPermissions.ts'
import { usePagination } from '@/composables/commons/usePagination.ts'
import { useAutoPlay } from '@/composables/dashboard/useAutoPlay.ts'
import { useBuildingsStore } from '@/stores/digital-twin/buildings.ts'
import TableToolbar from '@/components/dashboard/table/TableToolbar.vue'
import TelemetryTable, { type TableState } from '@/components/dashboard/table/TelemetryTable.vue'
import AddColumnPanel from '@/components/dashboard/table/AddColumnPanel.vue'
import ColumnSwapMenu from '@/components/dashboard/table/ColumnSwapMenu.vue'
import TablePagination from '@/components/commons/data/TablePagination.vue'

const DEFAULT_COLUMNS = ['roomName', 'status', 'roomMaxOccupancy']

const props = defineProps<{ buildingId?: string; rooms: TableBody[] }>()

const buildingId = toRef(props, 'buildingId')
const buildingsStore = useBuildingsStore()
const { canEdit } = useUserPermissions()

const headers = ref(DEFAULT_COLUMNS.map(metricKeyToHeader))
const query = ref('')
const filter = ref<RowFilter>('all')
const perPage = ref(8)

const columns = useColumnManager(headers, buildingId, (saved) => (headers.value = saved))

const hasEditPermission = computed(() =>
  canEdit(buildingId.value ? (buildingsStore.getById(buildingId.value)?.domains ?? []) : []),
)

const { readings, isLoading } = useBuildingReadings(
  buildingId,
  computed(() => sensorKinds(columns.localHeaders.value)),
)

const rows = computed(() =>
  filterRows(
    buildRows(props.rooms, columns.localHeaders.value, readings.value),
    query.value,
    filter.value,
  ),
)

const pagination = usePagination(rows, perPage)
const { currentPage, paginatedItems } = pagination

const { isAutoPlaying, toggleAutoPlay } = useAutoPlay(() => {
  if (currentPage.value < pagination.totalPages.value) pagination.nextPage()
  else pagination.goToFirst()
})

const tableState = computed<TableState>(() =>
  !buildingId.value ? 'no-building' : isLoading.value ? 'loading' : 'ready',
)
</script>

<template>
  <div class="space-y-4">
    <TableToolbar
      v-model:query="query"
      v-model:filter="filter"
      :can-edit="hasEditPermission"
      :editing="columns.isEditMode.value"
      :saving="columns.isSavingPreferences.value"
      :auto-playing="isAutoPlaying"
      @edit="columns.isEditMode.value = true"
      @add-column="columns.handleAddNew"
      @save="columns.savePreferences"
      @cancel="columns.cancelEdit"
      @toggle-auto-play="toggleAutoPlay"
    >
      <template #leading><slot name="leading" /></template>
    </TableToolbar>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <AddColumnPanel
        v-if="columns.showAddPanel.value && columns.isEditMode.value"
        :metrics="columns.addableMetrics.value"
        :is-fetching="columns.isFetchingMetrics.value"
        :failed="columns.metricsFailed.value"
        @select="columns.handleAddColumn"
        @close="columns.showAddPanel.value = false"
        @retry="columns.retryMetrics"
      />
    </Transition>

    <div class="surface-card flex flex-col overflow-hidden">
      <TelemetryTable
        :headers="columns.localHeaders.value"
        :rows="paginatedItems"
        :state="tableState"
        :editing="columns.isEditMode.value"
        :active-header-key="columns.activeHeaderKey.value"
        @column-click="columns.handleColumnClick"
        @delete-column="columns.handleDeleteColumn"
        @add-column="columns.handleAddNew"
        @reorder="columns.handleReorderColumns"
      />
      <TablePagination v-model:page="currentPage" v-model:per-page="perPage" :total="rows.length" />
    </div>

    <ColumnSwapMenu
      :visible="!!columns.activeHeaderKey.value && columns.isEditMode.value"
      :active-header="columns.activeHeader.value"
      :metrics="columns.swappableMetrics.value"
      :is-fetching="columns.isFetchingMetrics.value"
      :position="columns.dropdownPos.value"
      @swap="columns.handleSwapColumn"
      @close="columns.activeHeaderKey.value = null"
    />
  </div>
</template>

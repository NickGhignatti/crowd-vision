<script setup lang="ts">
import { getBuildingData } from '@/composables/building/useSensorData.ts'
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import PaginationControls from '@/components/panels/PaginationControls.vue'
import { usePagination } from '@/composables/ui/usePagination.ts'
import { useAutoPlay } from '@/composables/scene/useAutoPlay.ts'
import StatusRecord from '@/components/records/StatusRecord.vue'
import DataRecord from '@/components/records/DataRecord.vue'
import EmptyRecord from '@/components/records/EmptyRecord.vue'

export interface TableHeader {
  key: keyof TableBody
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

    return {
      ...item,
      temp: roomTempData ? `${roomTempData.value}°C` : item.temp,
      people: roomPeople ? `${roomPeople.value}` : item.people,
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
    class="w-full max-w-5xl bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden flex flex-col"
  >
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead class="bg-emerald-600 text-white">
          <tr>
            <th
              v-for="header in headers"
              :key="header.key"
              class="p-5 font-semibold text-sm uppercase tracking-wide border-r border-emerald-500 last:border-r-0"
            >
              {{ t(header.label) }}
            </th>
          </tr>
        </thead>

        <tbody>
          <StatusRecord v-if="!buildingIdRef" :colspan="headers.length" pulse>
            {{ t('dashboard.table.noDataAvailable') }}
          </StatusRecord>

          <StatusRecord
            v-else-if="loadingTemperature || loadingPeople"
            :colspan="headers.length"
            pulse
          >
            {{ t('model.loading') }}
          </StatusRecord>

          <template v-else>
            <DataRecord
              v-for="(item, index) in paginatedItems"
              :key="index"
              :item="item"
              :headers="headers"
            >
              <template v-for="header in headers" #[header.key]="slotProps">
                <slot :name="header.key" v-bind="slotProps" />
              </template>
            </DataRecord>

            <EmptyRecord :count="emptyRows" :headers="headers" />

            <StatusRecord v-if="paginatedItems.length === 0" :colspan="headers.length">
              {{ t('dashboard.table.noDataAvailable') }}
            </StatusRecord>
          </template>
        </tbody>
      </table>
    </div>

    <PaginationControls
      :current-page="currentPage"
      :total-pages="totalPages"
      :is-auto-playing="isAutoPlaying"
      @toggle-auto-play="toggleAutoPlay"
      @prev-page="prevPage"
      @next-page="nextPage"
    />
  </div>
</template>

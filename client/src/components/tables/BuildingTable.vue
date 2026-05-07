<script setup lang="ts">
import { getBuildingData } from '@/composables/useSensorData'
import { ref, computed, onUnmounted, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { roomColorByTemperature } from '@/helpers/colors.ts'
import PaginationControls from '@/components/panels/PaginationControls.vue'

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

const currentPage = ref(1)
const isAutoPlaying = ref(false)
let autoPlayInterval: number | undefined

const totalPages = computed(() => Math.ceil(enrichedItems.value.length / props.itemsPerPage))

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * props.itemsPerPage
  const end = start + props.itemsPerPage
  return enrichedItems.value.slice(start, end)
})

const emptyRows = computed(() => {
  const length = paginatedItems.value.length
  if (length === 0) return 0
  return Math.max(0, props.itemsPerPage - length)
})

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  } else if (isAutoPlaying.value) {
    currentPage.value = 1
  }
}

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

const toggleAutoPlay = () => {
  isAutoPlaying.value = !isAutoPlaying.value

  if (isAutoPlaying.value) {
    autoPlayInterval = window.setInterval(() => {
      nextPage()
    }, 2000)
  } else {
    clearInterval(autoPlayInterval)
  }
}

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

onUnmounted(() => {
  if (autoPlayInterval) clearInterval(autoPlayInterval)
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

        <tbody v-if="!buildingIdRef">
          <tr>
            <td :colspan="headers.length" class="p-8 text-center text-slate-500 animate-pulse">
              No data
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="loadingTemperature || loadingPeople">
          <tr>
            <td :colspan="headers.length" class="p-8 text-center text-slate-500 animate-pulse">
              Loading data...
            </td>
          </tr>
        </tbody>
        <tbody v-else class="divide-y-2 divide-slate-200">
          <tr
            v-for="(item, index) in paginatedItems"
            :key="index"
            class="hover:bg-slate-50 transition-colors duration-150"
          >
            <td
              v-for="header in headers"
              :key="header.key"
              class="p-5 border-r border-slate-200 last:border-r-0"
              :class="header.cellClass"
            >
              <slot :name="header.key" :item="item" :value="item[header.key]">
                <span
                  :style="{
                    color:
                      header.key === 'temp'
                        ? roomColorByTemperature(parseFloat(item[header.key]))
                        : 'inherit',
                  }"
                >
                  {{ item[header.key] }}
                </span>
              </slot>
            </td>
          </tr>

          <tr
            v-for="n in emptyRows"
            :key="'empty-' + n"
            class="hover:bg-slate-50 transition-colors duration-150"
          >
            <td
              v-for="header in headers"
              :key="header.key"
              class="p-5 border-r border-slate-200 last:border-r-0"
              :class="header.cellClass"
            >
              &nbsp;
            </td>
          </tr>

          <tr v-if="paginatedItems.length === 0">
            <td :colspan="headers.length" class="p-8 text-center text-slate-500">
              {{ t('dashboard.table.noDataAvailable') }}
            </td>
          </tr>
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

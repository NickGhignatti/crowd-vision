<script setup lang="ts">
import Navbar from '@/components/layouts/Navbar.vue'
import FullscreenModeButton from '@/components/buttons/FullscreenModeButton.vue'
import type { Room } from '@/models/building'
import ModelDropdown from '@/components/dropdowns/ModelDropdown.vue'
import BuildingTable, { type TableBody, type TableHeader } from '@/components/tables/BuildingTable.vue'

import { onMounted, onUnmounted, ref } from 'vue'
import { getStatusByOccupants, getStatusColor } from '@/helpers/status'
import { useI18n } from 'vue-i18n'
import GraphDashboard from '@/components/dashboards/GraphDashboard.vue'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import TableViewModeButton from '@/components/buttons/TableViewModeButton.vue'
import GraphViewModeButton from '@/components/buttons/GraphViewModeButton.vue'
import TimeCard from '@/components/cards/TimeCard.vue'
import DateCard from '@/components/cards/DateCard.vue'

const domainStore = useDomainsStore()
const buildingStore = useBuildingsStore()

const { t } = useI18n()

export interface ModelOption {
  id: string
  name: string
}
const models = ref<ModelOption[]>([])
const selectedModel = ref<ModelOption | null>(null)

// View State
const viewMode = ref<'table' | 'graph'>('table')
const focusSection = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)

// Data State
const roomData = ref<TableBody[]>([]) // Processed data for Table

const tableHeaders = ref<TableHeader[]>([
  { key: 'room', label: 'dashboards.table.headers.room', cellClass: 'font-medium text-slate-900' },
  { key: 'status', label: 'dashboards.table.headers.status', cellClass: 'text-sm' },
  { key: 'teacher', label: 'dashboards.table.headers.teacher', cellClass: 'text-sm' },
  {
    key: 'temp',
    label: 'dashboards.table.headers.temperature',
    cellClass: 'text-slate-900 font-medium',
  },
  { key: 'people', label: 'dashboards.table.headers.people', cellClass: 'text-slate-900' },
  {
    key: 'capacity',
    label: 'dashboards.table.headers.capacity',
    cellClass: 'text-slate-900 font-medium',
  },
])

const fetchRoomsByBuilding = async (buildingId: string) => {
  try {
    roomData.value = []

    const building = buildingStore.getById(buildingId)

    if (building && building.rooms) {
      building.rooms.forEach((room: Room) => {
        const roomName = room.name?.trim() || room.id
        roomData.value.push({
          room: roomName,
          roomId: room.id,
          status: getStatusByOccupants(0, room.capacity),
          teacher: '',
          temp: '',
          people: '0',
          capacity: room.capacity.toString(),
        })
      })
    }
  } catch (err) {
    console.error('Error fetching rooms:', err)
  }
}

const handleModelChange = (model: ModelOption) => {
  selectedModel.value = model
  fetchRoomsByBuilding(model.id)
}

const toggleFocusMode = async () => {
  const elem = focusSection.value
  if (!elem) return
  try {
    if (!document.fullscreenElement) await elem.requestFullscreen()
    else await document.exitFullscreen()
  } catch (err) {
    console.error(err)
  }
}

const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

const getInitialModels = async () => {
  try {
    const memberships = domainStore.memberships || []
    await buildingStore.fetch(memberships)

    models.value = buildingStore.all.map((b) => ({
      id: b.id,
      name: b.name?.trim() || b.id,
    }))

    if (models.value.length > 0 && models.value[0]) {
      handleModelChange(models.value[0])
    }
  } catch (error) {
    console.error('Error initializing models:', error)
  }
}

onMounted(() => {
  getInitialModels()
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <Navbar />

    <div
      ref="focusSection"
      class="flex flex-col items-center pt-12 px-4 pb-20 bg-slate-50 overflow-y-auto w-full"
    >
      <FullscreenModeButton
        :is-fullscreen="isFullscreen"
        @toggleFocusMode="toggleFocusMode"
      ></FullscreenModeButton>

      <div class="mb-10 w-full max-w-5xl grid grid-cols-3 items-center">
        <div class="flex justify-start">
          <div class="bg-slate-200 p-1 rounded-full flex relative shadow-inner w-max">
            <div
              class="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow-sm transition-all duration-300 ease-out"
              :class="viewMode === 'table' ? 'left-1' : 'left-[50%]'"
            ></div>

            <TableViewModeButton view-mode="viewMode" @click="viewMode = 'table'" />
            <GraphViewModeButton view-mode="viewMode" @click="viewMode = 'graph'" />
          </div>
        </div>

        <div class="text-center">
          <TimeCard
            as="h2"
            class-name="text-4xl font-extrabold text-slate-800 tracking-tight tabular-nums"
          />
        </div>

        <div class="flex justify-end">
          <ModelDropdown
            :selectedModel="selectedModel"
            :models="models"
            @model-changed="handleModelChange"
          />
        </div>

        <DateCard
          as="p"
          class-name="text-center text-slate-500 font-medium mt-2 text-lg"
        />
      </div>

      <div class="w-full max-w-5xl relative min-h-[400px]">
        <Transition name="fade" mode="out-in">
          <div v-if="viewMode === 'table'" key="table" class="w-full">
            <BuildingTable
              :headers="tableHeaders"
              :roomsData="roomData"
              :selectedBuildingId="selectedModel?.id"
              class="fullscreen:transform fullscreen:scale-150 fullscreen:origin-top"
            >
              <template #status="{ value }">
                <span :class="getStatusColor(value)">{{ t(value) }}</span>
              </template>
              <template #teacher="{ value }">
                <span :class="getStatusColor(value)">{{ value }}</span>
              </template>
              <template #people="{ value }">
                <div class="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="text-slate-400"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span class="font-bold">{{ value }}</span>
                </div>
              </template>
            </BuildingTable>
          </div>

          <div v-else key="graph" class="w-full">
            <GraphDashboard
              :selectedRooms="roomData.map((r: TableBody) => r.roomId)"
              :selectedBuildingId="selectedModel?.id"
            />
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

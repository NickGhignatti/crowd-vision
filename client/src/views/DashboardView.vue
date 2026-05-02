<script setup lang="ts">
import NavBar from '@/components/NavBar.vue'
import FullScreenMode from '@/components/buttons/FullScreenMode.vue'
import type { Room, Building } from '@/models/building'
import ModelSelectionDropdown from '@/components/menus/ModelSelectionDropdown.vue'
import DataTable, { type TableBody, type TableHeader } from '@/components/tables/DataTable.vue'

import { onMounted, onUnmounted, ref } from 'vue'
import { makeRequest } from '@/composables/useApi.ts'
import { useDateTime } from '@/composables/useDateTime'
import { getStatusByOccupants, getStatusColor } from '@/helpers/status'
import { useI18n } from 'vue-i18n'
import GraphDashboard from '@/components/dashboard/GraphDashboard.vue'
import type { DomainMembership } from '@/models/domain'
import { useAuthStore } from '@/stores/authentication.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'

const authStore = useAuthStore()
const buildingStore = useBuildingsStore()

const { t, locale } = useI18n()

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

const { formattedTime, formattedDate } = useDateTime(locale)

const tableHeaders = ref<TableHeader[]>([
  { key: 'room', label: 'dashboard.table.headers.room', cellClass: 'font-medium text-slate-900' },
  { key: 'status', label: 'dashboard.table.headers.status', cellClass: 'text-sm' },
  { key: 'teacher', label: 'dashboard.table.headers.teacher', cellClass: 'text-sm' },
  {
    key: 'temp',
    label: 'dashboard.table.headers.temperature',
    cellClass: 'text-slate-900 font-medium',
  },
  { key: 'people', label: 'dashboard.table.headers.people', cellClass: 'text-slate-900' },
  {
    key: 'capacity',
    label: 'dashboard.table.headers.capacity',
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
    const username = authStore.accountName
    if (!username) return

    const authRes = await makeRequest(`/auth/domains/${username}`)
    if (!authRes.ok) {
      console.error('Failed to fetch user domains')
      return
    }

    const authData = await authRes.json()
    const memberships = authData.domains as DomainMembership[]
    const allBuildings: Building[] = []

    // Fetch Buildings for each Domain
    await Promise.all(
      memberships.map(async (m) => {
        try {
          const buildRes = await makeRequest(`/twin/buildings/${m.domainName}`)
          if (buildRes.ok) {
            const domainBuildings = (await buildRes.json()) as Building[]
            allBuildings.push(...domainBuildings)
          }
        } catch (err) {
          console.warn(`Failed to fetch buildings for domain ${m.domainName}`, err)
        }
      }),
    )

    const uniqueIds = new Set()
    models.value = allBuildings
      .filter((b) => {
        if (uniqueIds.has(b.id)) return false
        uniqueIds.add(b.id)
        return true
      })
      .map((b) => ({
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
    <NavBar />

    <div
      ref="focusSection"
      class="flex flex-col items-center pt-12 px-4 pb-20 bg-slate-50 overflow-y-auto w-full"
    >
      <FullScreenMode
        :is-fullscreen="isFullscreen"
        @toggleFocusMode="toggleFocusMode"
      ></FullScreenMode>

      <div class="mb-10 w-full max-w-5xl grid grid-cols-3 items-center">
        <div class="flex justify-start">
          <div class="bg-slate-200 p-1 rounded-full flex relative shadow-inner w-max">
            <div
              class="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow-sm transition-all duration-300 ease-out"
              :class="viewMode === 'table' ? 'left-1' : 'left-[50%]'"
            ></div>

            <button
              @click="viewMode = 'table'"
              class="relative z-10 px-6 py-1.5 text-sm font-semibold rounded-full transition-colors duration-300 flex items-center gap-2"
              :class="
                viewMode === 'table' ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'
              "
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              List
            </button>

            <button
              @click="viewMode = 'graph'"
              class="relative z-10 px-6 py-1.5 text-sm font-semibold rounded-full transition-colors duration-300 flex items-center gap-2"
              :class="
                viewMode === 'graph' ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'
              "
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              Graph
            </button>
          </div>
        </div>

        <div class="text-center">
          <h2 class="text-4xl font-extrabold text-slate-800 tracking-tight tabular-nums">
            {{ formattedTime }}
          </h2>
        </div>

        <div class="flex justify-end">
          <ModelSelectionDropdown
            :selectedModel="selectedModel"
            :models="models"
            @model-changed="handleModelChange"
          />
        </div>

        <p class="col-span-3 text-center text-slate-500 font-medium mt-2 text-lg">
          {{ formattedDate }}
        </p>
      </div>

      <div class="w-full max-w-5xl relative min-h-[400px]">
        <Transition name="fade" mode="out-in">
          <div v-if="viewMode === 'table'" key="table" class="w-full">
            <DataTable
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
            </DataTable>
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

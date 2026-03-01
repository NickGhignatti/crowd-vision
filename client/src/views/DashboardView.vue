<script setup lang="ts">
import NavBar from '@/components/NavBar.vue'
import FullScreenMode from '@/components/buttons/FullScreenMode.vue'
import type { RoomPayload, BuildingPayload } from '@/models/building'
import ModelSelectionDropdown from '@/components/menus/ModelSelectionDropdown.vue'
import DataTable, { type TableBody, type TableHeader } from '@/components/tables/DataTable.vue'

import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GraphDashboard from '@/components/dashboard/GraphDashboard.vue'
import type { DomainMembership } from '@/models/domain'

const now = ref(new Date())

let timer: ReturnType<typeof setInterval>
const { t, locale } = useI18n()

// View State
const viewMode = ref<'table' | 'graph'>('table')
const focusSection = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)

export interface ModelOption {
  id: string
  name: string
}
const models = ref<ModelOption[]>([])
const selectedModel = ref<ModelOption | null>(null)

// Data State
const roomData = ref<any>([])       // Processed data for Table

const formattedTime = computed(() => {
  return new Intl.DateTimeFormat(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now.value)
})

const formattedDate = computed(() => {
  return new Intl.DateTimeFormat(locale.value, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now.value)
})

const tableHeaders = ref<TableHeader[]>([
  { key: 'room', label: 'dashboard.table.headers.room', cellClass: 'font-medium text-slate-900' },
  { key: 'status', label: 'dashboard.table.headers.status', cellClass: 'text-sm' },
  { key: 'teacher', label: 'dashboard.table.headers.teacher', cellClass: 'text-sm' },
  { key: 'temp', label: 'dashboard.table.headers.temperature', cellClass: 'text-slate-900 font-medium' },
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

    const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/twin/building/${buildingId}`)
    if (!response.ok) throw new Error('Failed to fetch building data')

    const building = (await response.json()) as BuildingPayload

    if (building && building.rooms) {
      building.rooms.forEach((room: RoomPayload) => {
        const occupants = Math.floor(Math.random() * room.capacity)
        roomData.value.push({
          room: room.id,
          status: t(getStatusByOccupants(occupants, room.capacity)),
          teacher: '',
          temp: '',
          people: occupants.toString(),
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

const getStatusByOccupants = (occupants: number, roomCapacity: number) => {
  const occupantsPercentage = occupants / roomCapacity
  if (occupantsPercentage == 0.0) return 'dashboard.table.rooms.status.empty'
  if (occupantsPercentage <= 0.5) return 'dashboard.table.rooms.status.normal'
  if (occupantsPercentage <= 0.95) return 'dashboard.table.rooms.status.crowded'
  if (occupantsPercentage <= 1.0) return 'dashboard.table.rooms.status.full'
  return 'dashboard.table.rooms.status.overcrowded'
}

const getStatusColor = (status: string) => {
  if (!status) return ''
  switch (status) {
    case t('dashboard.table.rooms.status.empty'):
      return 'text-emerald-600 font-semibold'
    case t('dashboard.table.rooms.status.normal'):
      return 'text-blue-600'
    case t('dashboard.table.rooms.status.crowded'):
      return 'text-orange-600'
    case t('dashboard.table.rooms.status.full'):
      return 'text-red-600 font-semibold'
    default:
      return 'text-red-600 font-semibold'
  }
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

const serverUrl = import.meta.env.VITE_SERVER_URL
const getInitialModels = async () => {
  try {
    const username = localStorage.getItem('username')
    if (!username) return

    const authRes = await fetch(`${serverUrl}/auth/domains/${username}`)
    if (!authRes.ok) throw new Error('Failed to fetch user domains')

    const authData = await authRes.json()
    const memberships = authData.domains as DomainMembership[]
    const allBuildings: BuildingPayload[] = []

    // Fetch Buildings for each Domain
    await Promise.all(
      memberships.map(async (m) => {
        try {
          const buildRes = await fetch(`${serverUrl}/twin/buildings/${m.domainName}`)
          if (buildRes.ok) {
            const domainBuildings = (await buildRes.json()) as BuildingPayload[]
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
        name: b.id,
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
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onUnmounted(() => {
  clearInterval(timer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <NavBar />

    <div
      ref="focusSection"
      class="flex flex-col items-center pt-8 px-4 pb-20 bg-slate-50 overflow-y-auto w-full transition-all"
    >
      <FullScreenMode :is-fullscreen="isFullscreen" @toggleFocusMode="toggleFocusMode"></FullScreenMode>

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
              :class="viewMode === 'table' ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              List
            </button>

            <button 
              @click="viewMode = 'graph'"
              class="relative z-10 px-6 py-1.5 text-sm font-semibold rounded-full transition-colors duration-300 flex items-center gap-2"
              :class="viewMode === 'graph' ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
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
          <ModelSelectionDropdown :selectedModel="selectedModel" :models="models" @model-changed="handleModelChange" />
        </div>

        <p class="col-span-3 text-center text-slate-500 font-medium mt-2 text-lg">
          {{ formattedDate }}
        </p>
      </div>

      <div class="w-full max-w-5xl relative min-h-[400px]">
        <Transition name="fade" mode="out-in">
          
          <div v-if="viewMode === 'table'" key="table" class="w-full">
            <DataTable :headers="tableHeaders" :items="roomData"
              class="fullscreen:transform fullscreen:scale-150 fullscreen:origin-top">
              <template #status="{ value }">
                <span :class="getStatusColor(value)">{{ value }}</span>
              </template>
              <template #teacher="{ value }">
                <span :class="getStatusColor(value)">{{ value }}</span>
              </template>
              <template #people="{ value }">
                <div class="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" class="text-slate-400">
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
              :selectedRooms="roomData.map((r: TableBody) => r.room)"
              :selectedTwinId="selectedModel?.id" 
            />
          </div>

        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
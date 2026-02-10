<script setup lang="ts">
import NavBar from '@/components/NavBar.vue'
import FullScreenMode from '@/components/buttons/FullScreenMode.vue'
import type { RoomPayload, BuildingPayload } from '@/models/building'
import ModelSelectionDropdown from '@/components/menus/ModelSelectionDropdown.vue'
import DataTable, { type TableBody, type TableHeader } from '@/components/tables/DataTable.vue'

import { useI18n } from 'vue-i18n'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const { t, locale } = useI18n()

const now = ref(new Date())
const isFullscreen = ref(false)
const roomData = ref<TableBody[]>([])
const focusSection = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setInterval>

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

const handleModelChange = (modelId: string) => {
  fetchRoomsByBuilding(modelId)
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

onMounted(() => {
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

    <div ref="focusSection" class="flex flex-col items-center pt-12 px-4 pb-20 bg-slate-50 overflow-y-auto w-full">
      <FullScreenMode :is-fullscreen="isFullscreen" @toggleFocusMode="toggleFocusMode"></FullScreenMode>

      <div class="mb-10 w-full max-w-4xl grid grid-cols-3 items-center">
        <div />
        <div class="text-center">
          <h2 class="text-4xl font-extrabold text-slate-800 tracking-tight tabular-nums">
            {{ formattedTime }}
          </h2>
        </div>
        <div class="flex justify-start pl-4">
          <ModelSelectionDropdown @model-changed="handleModelChange" />
        </div>
        <p class="col-span-3 text-center text-slate-500 font-medium mt-2 text-lg">
          {{ formattedDate }}
        </p>
      </div>

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
  </div>
</template>

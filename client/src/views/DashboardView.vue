<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import DataTable, { type TableHeader } from '@/components/DataTable.vue'
import type { RoomPayload } from '@/scripts/schema.ts'

const now = ref(new Date())
const serverUrl = import.meta.env.VITE_SERVER_URL
let timer: ReturnType<typeof setInterval>

onMounted(() => {
  fetchRooms()
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onUnmounted(() => {
  clearInterval(timer)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})

const { locale } = useI18n()

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

import { useI18n } from 'vue-i18n'

const tableHeaders = ref<TableHeader[]>([
  { key: 'room', label: 'headers.room', cellClass: 'font-medium text-slate-900' },
  { key: 'status', label: 'headers.status', cellClass: 'text-sm' },
  { key: 'teacher', label: 'headers.teacher', cellClass: 'text-sm' },
  { key: 'temp', label: 'headers.temp', cellClass: 'text-slate-900 font-medium' },
  { key: 'people', label: 'headers.people', cellClass: 'text-slate-900' },
  { key: 'capacity', label: 'headers.capacity', cellClass: 'text-slate-900 font-medium' },
])

const roomData = ref<any>([])

const fetchRooms = async () => {
  try {
    const userDomain = (
      await fetch(serverUrl + '/auth/domain/' + localStorage.getItem('username')).then((response) =>
        response.json(),
      )
    ).domain.name as string

    const response = await fetch(serverUrl + '/twin/buildings/' + userDomain)
    if (!response.ok) console.log('Failed to fetch data')

    const result = await response.json()

    result[0].rooms.forEach((room: RoomPayload) => {
      const occupants = Math.floor(Math.random() * room.capacity)
      roomData.value.push({
        room: room.id,
        status: getStatusByOccupants(occupants, room.capacity),
        teacher: '',
        temp: '',
        people: occupants,
        capacity: room.capacity,
      })
    })
  } catch (err) {
    console.error(err)
  }
}

const getStatusByOccupants = (occupants: number, roomCapacity: number) => {
  const occupantsPercentage = occupants / roomCapacity
  if (occupantsPercentage == 0.0) {
    return 'empty'
  } else if (occupantsPercentage <= 0.5) {
    return 'normal'
  } else if (occupantsPercentage <= 0.95) {
    return 'crowded'
  } else if (occupantsPercentage <= 1.0) {
    return 'full'
  } else {
    return 'overcrowded'
  }
}

const getStatusColor = (status: string) => {
  if (status) {
    switch (status.toLowerCase()) {
      case 'empty':
        return 'text-emerald-600 font-semibold'
      case 'normal':
        return 'text-blue-600'
      case 'crowded':
        return 'text-orange-600'
      case 'full':
        return 'text-red-600 font-semibold'
      case 'overcrowded':
        return 'text-red-600 font-semibold'
    }
  }
}

const focusSection = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)

const toggleFocusMode = async () => {
  const elem = focusSection.value
  if (!elem) return

  try {
    if (!document.fullscreenElement) {
      await elem.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  } catch (err) {
    console.error(err)
  }
}

const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <NavBar />

    <div
      ref="focusSection"
      class="flex flex-col items-center pt-12 px-4 pb-20 bg-slate-50 overflow-y-auto w-full"
    >
      <button
        v-if="!isFullscreen"
        @click="toggleFocusMode"
        class="mb-6 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-center gap-2"
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
          <path
            d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
          />
        </svg>
        Focus Mode
      </button>

      <div class="mb-10 text-center">
        <h2 class="text-4xl font-extrabold text-slate-800 tracking-tight tabular-nums">
          {{ formattedTime }}
        </h2>
        <p class="text-slate-500 font-medium mt-2 text-lg">
          {{ formattedDate }}
        </p>
      </div>

      <DataTable
        :headers="tableHeaders"
        :items="roomData"
        class="fullscreen:transform fullscreen:scale-150 fullscreen:origin-top"
      >
        <template #status="{ value }">
          <span :class="getStatusColor(value)">{{ value }}</span>
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
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span class="font-bold">{{ value }}</span>
          </div>
        </template>
      </DataTable>
    </div>
  </div>
</template>

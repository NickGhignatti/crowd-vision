<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import DataTable, { type TableHeader } from '@/components/DataTable.vue'
import type { RoomPayload } from '@/scripts/schema.ts'

const now = ref(new Date())
let timer: ReturnType<typeof setInterval>

onMounted(() => {
  fetchRooms()
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})

const formattedTime = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now.value)
})

const formattedDate = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now.value)
})

import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
    const response = await fetch('http://localhost:3000/building/unibo-campus-cesena')
    if (!response.ok) console.log('Failed to fetch data')

    const result = await response.json()
    const userHasDomain = (
      await fetch('http://localhost:3000/domain/' + localStorage.getItem('username')).then(
        (response) => response.json(),
      )
    ).domain as string

    const buildingDomains = result.building.domains as string[]

    if (buildingDomains.includes(userHasDomain)) {
      result.building.rooms.forEach((room: RoomPayload) => {
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
    }
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
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <NavBar />

    <div class="flex flex-col items-center pt-12 px-4 pb-20">
      <div class="mb-10 text-center">
        <h2 class="text-4xl font-extrabold text-slate-800 tracking-tight tabular-nums">
          {{ formattedTime }}
        </h2>
        <p class="text-slate-500 font-medium mt-2 text-lg">
          {{ formattedDate }}
        </p>
      </div>

      <DataTable :headers="tableHeaders" :items="roomData">
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

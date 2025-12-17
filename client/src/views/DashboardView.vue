<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import DataTable, { type TableHeader } from '@/components/DataTable.vue'

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

const tableHeaders = ref<TableHeader[]>([
  { key: 'room', label: 'Room', cellClass: 'font-medium text-slate-900' },
  { key: 'status', label: 'Status', cellClass: 'text-sm' },
  { key: 'teacher', label: 'Teacher', cellClass: 'text-sm' },
  { key: 'temp', label: 'Temperature', cellClass: 'text-slate-900 font-medium' },
  { key: 'people', label: 'Number of People', cellClass: 'text-slate-900' },
])

const roomData = ref([])

const fetchRooms = async () => {
  try {
    const response = await fetch('http://localhost:3000/roomData')
    if (!response.ok) console.log('Failed to fetch data')

    const result = await response.json()
    roomData.value = result.roomData
  } catch (err) {
    console.error(err)
  }
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'free':
      return 'text-emerald-600 font-semibold'
    case 'busy':
      return 'text-red-500 font-semibold'
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

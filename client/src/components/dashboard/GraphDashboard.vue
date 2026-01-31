<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler
} from 'chart.js'
import { Line } from 'vue-chartjs'

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend, Filler)

// --- Types ---
type TimeRange = '1D' | '1W' | '1M'
type AggMode = 'tot' | 'avg' | 'min' | 'max'

const props = defineProps<{
  buildings: any[]
}>()

// --- State ---
const selectedTwinId = ref<string>('')
const timeRange = ref<TimeRange>('1D')
const aggMode = ref<AggMode>('avg') // Default to AVG so both graphs show

// Select first building on load
watch(() => props.buildings, (newVal) => {
  if (newVal && newVal.length > 0 && !selectedTwinId.value) {
    selectedTwinId.value = newVal[0].id
  }
}, { immediate: true })

// --- Helper: Generate Time Labels ---
const getLabels = (range: TimeRange) => {
  const labels = []
  const now = new Date()
  
  if (range === '1D') {
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000)
      labels.push(d.getHours() + ':00')
    }
  } else if (range === '1W') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }))
    }
  } else {
    for (let i = 9; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3 * 24 * 60 * 60 * 1000)
      labels.push(d.getDate() + '/' + (d.getMonth() + 1))
    }
  }
  return labels
}

// --- Helper: Generate Mock Trend Data ---
// Logic: Generates a line based on the Aggregation Mode
const generateTrendData = (range: TimeRange, type: 'people' | 'temp', mode: AggMode) => {
  const points = range === '1D' ? 24 : range === '1W' ? 7 : 10
  const data = []
  
  // Base values configuration
  let base = type === 'people' ? 50 : 21
  let variance = type === 'people' ? 15 : 2

  // Adjust base based on Mode
  if (mode === 'tot' && type === 'people') base = 300 // Total is higher
  if (mode === 'max' && type === 'people') base = 80  // Max capacity
  if (mode === 'min' && type === 'people') base = 5   // Empty rooms
  
  if (mode === 'max' && type === 'temp') base = 24
  if (mode === 'min' && type === 'temp') base = 19

  for (let i = 0; i < points; i++) {
    const randomShift = Math.random() * variance * 2 - variance
    let val = Math.floor(base + randomShift)
    if (val < 0) val = 0
    data.push(val)
  }
  return data
}

// --- Chart Options ---
const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { 
    mode: 'index' as const, // Fixed TypeScript error
    intersect: false 
  },
  plugins: { legend: { display: false } },
  elements: {
    line: { tension: 0.4 }, 
    point: { radius: 3, hitRadius: 10 }
  },
  scales: {
    y: { beginAtZero: true }
  }
}

const tempOptions = {
  ...commonOptions,
  scales: {
    y: { 
      // Temp usually doesn't start at 0 for better visibility
      min: 10, 
      max: 35 
    }
  }
}

// 1. People Chart Data
const peopleChartData = computed(() => ({
  labels: getLabels(timeRange.value),
  datasets: [{
    label: `Occupancy (${aggMode.value})`,
    borderColor: '#4f46e5', // Indigo
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
    fill: true,
    data: generateTrendData(timeRange.value, 'people', aggMode.value)
  }]
}))

// 2. Temperature Chart Data
const tempChartData = computed(() => ({
  labels: getLabels(timeRange.value),
  datasets: [{
    label: `Temp (${aggMode.value})`,
    borderColor: '#f97316', // Orange
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    fill: true,
    data: generateTrendData(timeRange.value, 'temp', aggMode.value)
  }]
}))
</script>

<template>
  <div class="flex flex-col gap-6">
    
    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row items-center justify-between gap-4">
      
      <div class="relative w-full xl:w-auto">
        <select 
          v-model="selectedTwinId"
          class="appearance-none bg-slate-50 border border-slate-300 text-slate-700 font-medium text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full xl:w-64 p-2.5 pr-8"
        >
          <option v-for="twin in buildings" :key="twin.id" :value="twin.id">
            {{ twin.name || twin.id }}
          </option>
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>

      <div class="flex flex-wrap gap-4 justify-center w-full xl:w-auto">
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-400 uppercase mr-1">Data:</span>
            <div class="flex bg-slate-100 p-1 rounded-lg">
                <button 
                v-for="mode in ['tot', 'avg', 'min', 'max']" 
                :key="mode"
                @click="aggMode = mode as AggMode"
                class="px-3 py-1.5 text-xs font-bold uppercase rounded-md transition-all duration-200"
                :class="aggMode === mode 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'"
                >
                {{ mode }}
                </button>
            </div>
        </div>

        <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-400 uppercase mr-1">Range:</span>
            <div class="flex bg-slate-100 p-1 rounded-lg">
                <button 
                v-for="range in ['1D', '1W', '1M']" 
                :key="range"
                @click="timeRange = range as TimeRange"
                class="px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200"
                :class="timeRange === range 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'"
                >
                {{ range }}
                </button>
            </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 transition-all duration-500">
      
      <div 
        class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[400px] transition-all duration-500"
        :class="aggMode === 'tot' ? 'lg:col-span-2' : ''"
      >
        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex justify-between">
          <span>People Occupancy</span>
          <span class="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs border border-indigo-100">
             {{ aggMode }} / {{ timeRange }}
          </span>
        </h3>
        <div class="h-[320px]">
          <Line v-if="selectedTwinId" :data="peopleChartData" :options="commonOptions" />
        </div>
      </div>

      <div 
        v-if="aggMode !== 'tot'"
        class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[400px]"
      >
        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex justify-between">
          <span>Temperature</span>
          <span class="text-orange-600 bg-orange-50 px-2 py-0.5 rounded text-xs border border-orange-100">
             {{ aggMode }} / {{ timeRange }}
          </span>
        </h3>
        <div class="h-[320px]">
           <Line v-if="selectedTwinId" :data="tempChartData" :options="tempOptions" />
        </div>
      </div>

    </div>
  </div>
</template>
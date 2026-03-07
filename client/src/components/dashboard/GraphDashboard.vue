<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue'
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
import { getTwinHistory } from '@/composables/getTwinHistory'
import { useIsRunning, toggleSimulator } from '@/composables/simulator'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend, Filler)

// --- Types ---
export type TimeRange = '1D' | '1W' | '1M'
type AggMode = 'sum' | 'avg' | 'min' | 'max'

const props = defineProps<{
  selectedRooms: string[],
  selectedTwinId: string | undefined
}>()

const twinIdRef = toRef(props, 'selectedTwinId')

// --- State ---
const timeRange = ref<TimeRange>('1D')
const aggMode = ref<AggMode>('avg')

const toggleSimulatorButton = () => {
  if (!twinIdRef.value) return
  toggleSimulator(twinIdRef.value, isSimRunning.value ? 'stop' : 'start', props.selectedRooms).then(
    () => {
      isSimRunning.value = !isSimRunning.value
      
      setTimeout(() => {
        checkSimStatus()
      }, 500) // Delay to allow simulator state to update
    }
  ).catch(err => {
    console.error("Toggle failed", err)
    checkSimStatus()
  })
}

const { 
  data: peopleData, 
  isLoading: loadingPeople 
} = getTwinHistory(twinIdRef, timeRange, 'peopleCount')

const { 
  data: tempData, 
  isLoading: loadingTemp 
} = getTwinHistory(twinIdRef, timeRange, 'temperature')

const { isSimRunning, error, refetch } = useIsRunning(twinIdRef)

const checkSimStatus = () => {
  refetch()
}

// --- Chart Options ---
const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { 
    mode: 'index' as const,
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

const getTimeline = (range: TimeRange): Date[] => {
  const now = new Date(); 
  const timeline: Date[] = [];
  
  if (range === '1D') {
    now.setMinutes(0, 0, 0);
    for (let i = 23; i >= 0; i--) {
      timeline.push(new Date(now.getTime() - i * 60 * 60 * 1000));
    }
  } else {
    const days = range === '1W' ? 6 : 29;
    now.setHours(0, 0, 0, 0);
    for (let i = days; i >= 0; i--) {
      timeline.push(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    }
  }
  return timeline;
};

const alignDataToTimeline = (apiData: any[], timeline: Date[], range: TimeRange, mode: AggMode) => {
  return timeline.map(timeObj => {
    const match = apiData.find(d => {
      const dTime = new Date(d.timestamp);
      if (range === '1D') {
        return dTime.setMinutes(0, 0, 0) === timeObj.getTime();
      } else {
        return dTime.setHours(0, 0, 0, 0) === timeObj.getTime();
      }
    });
    
    return match ? match[mode] : 0; 
  });
};

const chartLabels = computed(() => {
  const timeline = getTimeline(timeRange.value);
  return timeline.map(date => {
    if (timeRange.value === '1D') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  });
});

// 1. People Chart Data
const peopleChartData = computed(() => {
  const timeline = getTimeline(timeRange.value);
  return {
    labels: chartLabels.value,
    datasets: [{
      label: `Occupancy (${aggMode.value})`,
      data: alignDataToTimeline(peopleData.value, timeline, timeRange.value, aggMode.value),
      borderColor: '#4f46e5',
      backgroundColor: 'rgba(79, 70, 229, 0.1)',
      fill: true,
    }]
  };
});

// 2. Temperature Chart Data
const tempChartData = computed(() => {
  const timeline = getTimeline(timeRange.value);
  return {
    labels: chartLabels.value,
    datasets: [{
      label: `Temp (${aggMode.value})`,
      borderColor: '#f97316',
      backgroundColor: 'rgba(249, 115, 22, 0.1)',
      fill: true,
      data: alignDataToTimeline(tempData.value, timeline, timeRange.value, aggMode.value)
    }]
  };
});

</script>

<template>
  <div class="flex flex-col gap-6">
    
    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row items-center justify-between gap-4">
      
      <div class="relative w-full xl:w-auto">
        <button
          @click="toggleSimulatorButton"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-2 mr-2"
          :class="
            isSimRunning
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
          "
        >
          <span v-if="isSimRunning" class="relative flex h-2 w-2">
            <span
              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
            ></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          {{ isSimRunning ? t('table.buttons.stop') : t('table.buttons.auto') }}
        </button>
      </div>

      <div class="flex flex-wrap gap-4 justify-center w-full xl:w-auto">
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-400 uppercase mr-1">Data:</span>
            <div class="flex bg-slate-100 p-1 rounded-lg">
                <button 
                v-for="mode in ['sum', 'avg', 'min', 'max']" 
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
        :class="aggMode === 'sum' ? 'lg:col-span-2' : ''"
      >
        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex justify-between">
          <span>People Occupancy</span>
          <span class="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs border border-indigo-100">
             {{ aggMode }} / {{ timeRange }}
          </span>
        </h3>
        <div class="h-[320px]">
          <div v-if="!twinIdRef?.valueOf" class="animate-pulse">No data</div>
          <div v-else-if="loadingPeople" class="animate-pulse">Loading...</div>
          <Line v-else :data="peopleChartData" :options="commonOptions" />
        </div>
      </div>

      <div 
        v-if="aggMode !== 'sum'"
        class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[400px]"
      >
        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex justify-between">
          <span>Temperature</span>
          <span class="text-orange-600 bg-orange-50 px-2 py-0.5 rounded text-xs border border-orange-100">
             {{ aggMode }} / {{ timeRange }}
          </span>
        </h3>
        <div class="h-[320px]">
            <div v-if="!twinIdRef?.valueOf" class="animate-pulse">No data</div>
            <div v-else-if="loadingTemp" class="animate-pulse">Loading...</div>
           <Line v-else :data="tempChartData" :options="commonOptions" />
        </div>
      </div>

    </div>
  </div>
</template>
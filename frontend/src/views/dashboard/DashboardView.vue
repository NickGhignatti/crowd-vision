<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildRows } from '@/utils/dashboard/tableRows.ts'
import { summarize } from '@/utils/dashboard/dashboard.ts'
import { useDashboardBuildings } from '@/composables/dashboard/useDashboardBuildings.ts'
import { useBuildingReadings } from '@/composables/dashboard/useBuildingSensor.ts'
import { useFullscreen } from '@/composables/commons/useFullscreen.ts'
import AppLayout from '@/components/commons/layout/AppLayout.vue'
import DashboardStatusBar from '@/components/dashboard/header/DashboardStatusBar.vue'
import ViewModeSwitch, {
  type DashboardView,
} from '@/components/dashboard/header/ViewModeSwitch.vue'
import KpiStrip from '@/components/dashboard/kpi/KpiStrip.vue'
import TelemetryPanel from '@/components/dashboard/table/TelemetryPanel.vue'
import ChartsPanel from '@/components/dashboard/charts/ChartsPanel.vue'

const SUMMARY_METRICS = ['peopleCount', 'temperature', 'airQuality']

const { options, selectedId, rooms, isLoading } = useDashboardBuildings()
const { readings, isLoading: readingsLoading } = useBuildingReadings(
  selectedId,
  computed(() => SUMMARY_METRICS),
)

// Rows built with no columns still carry the occupancy status the alert count needs.
const summary = computed(() =>
  summarize(buildRows(rooms.value, [], readings.value), readings.value),
)

const view = ref<DashboardView>('table')
const focusArea = ref<HTMLElement | null>(null)
const { isFullscreen, toggle: toggleFocus } = useFullscreen(focusArea)
</script>

<template>
  <AppLayout>
    <div
      ref="focusArea"
      class="space-y-6 fullscreen:overflow-y-auto fullscreen:bg-surface-container-low fullscreen:p-6"
    >
      <DashboardStatusBar
        v-model:building-id="selectedId"
        :buildings="options"
        :room-count="rooms.length"
        :is-fullscreen="isFullscreen"
        @toggle-focus="toggleFocus"
      />

      <KpiStrip :summary="summary" :loading="isLoading || readingsLoading" />

      <Transition
        mode="out-in"
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-1"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <TelemetryPanel v-if="view === 'table'" :building-id="selectedId" :rooms="rooms">
          <template #leading><ViewModeSwitch v-model="view" /></template>
        </TelemetryPanel>
        <ChartsPanel v-else :building-id="selectedId" :room-ids="rooms.map((room) => room.roomId)">
          <template #leading><ViewModeSwitch v-model="view" /></template>
        </ChartsPanel>
      </Transition>
    </div>
  </AppLayout>
</template>

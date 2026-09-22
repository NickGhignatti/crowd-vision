<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useBuildingModel } from '@/composables/digital-twin/useBuildingModel.ts'
import { provideSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import AppLayout from '@/components/commons/layout/AppLayout.vue'
import BuildingScene, { type ExplodeState } from '@/components/digital-twin/scene/BuildingScene.vue'
import BuildingSidebar from '@/components/digital-twin/buildings/BuildingSidebar.vue'
import RoomSidebar from '@/components/digital-twin/rooms/RoomSidebar.vue'
import SensorEditBar from '@/components/digital-twin/sensors/SensorEditBar.vue'
import AddSensorForm from '@/components/digital-twin/sensors/AddSensorForm.vue'
import PlacementHint from '@/components/digital-twin/sensors/PlacementHint.vue'

const {
  building,
  displayedBuilding,
  visibleRooms,
  availableBuildingsNames,
  selectedRoomId,
  selectedFloor,
  explodedRoomId,
  isExploded,
  fetchBuildings,
  setBuildingById,
  setFloor,
  toggleRoom,
} = useBuildingModel()

const onExplode = (state: ExplodeState) => {
  isExploded.value = state.exploded
  explodedRoomId.value = state.roomId
}

const { t } = useI18n()
const sensorEditor = provideSensorEditor(building)
const confirmLeave = () =>
  !sensorEditor.hasChanges.value || window.confirm(t('model.sensors.leaveConfirm'))

const selectBuilding = (id: string) => {
  if (confirmLeave()) setBuildingById(id)
}

onBeforeRouteLeave(confirmLeave)

// A tab close or reload skips the router, so the browser's own prompt has to cover it.
const warnOnUnload = (event: BeforeUnloadEvent) => {
  if (sensorEditor.hasChanges.value) event.preventDefault()
}
onMounted(() => {
  fetchBuildings()
  window.addEventListener('beforeunload', warnOnUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnOnUnload))
</script>

<template>
  <AppLayout variant="fill">
    <BuildingScene
      class="absolute inset-0"
      :building="building"
      :rooms="visibleRooms"
      :floor="selectedFloor"
      :selected-room-id="selectedRoomId"
      :exploded-room-id="explodedRoomId"
      :is-exploded="isExploded"
      @toggle-room="toggleRoom"
      @explode="onExplode"
    />

    <BuildingSidebar
      :buildings="availableBuildingsNames"
      :selected-id="building?.id ?? null"
      :building="building"
      :floor="selectedFloor"
      @update:floor="setFloor"
      @select="selectBuilding"
      @updated="fetchBuildings"
    />

    <div
      v-if="sensorEditor.isEditing.value"
      class="absolute left-1/2 top-4 z-30 flex w-80 -translate-x-1/2 flex-col items-center gap-2"
    >
      <SensorEditBar />
      <PlacementHint />
      <AddSensorForm
        v-if="sensorEditor.isAddPanelOpen.value"
        class="w-full bg-surface-container-lowest shadow-lift"
        :rooms="building?.rooms ?? []"
        @done="sensorEditor.isAddPanelOpen.value = false"
      />
    </div>

    <RoomSidebar
      :building="displayedBuilding"
      :selected-room-id="selectedRoomId"
      @select="toggleRoom"
    />
  </AppLayout>
</template>

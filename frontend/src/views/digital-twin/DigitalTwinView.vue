<script setup lang="ts">
import { onMounted } from 'vue'
import { useBuildingModel } from '@/composables/building/useBuildingModel.ts'
import AppLayout from '@/components/commons/layout/AppLayout.vue'
import BuildingScene, { type ExplodeState } from '@/components/digital-twin/scene/BuildingScene.vue'
import BuildingSidebar from '@/components/digital-twin/buildings/BuildingSidebar.vue'
import RoomSidebar from '@/components/digital-twin/rooms/RoomSidebar.vue'

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

onMounted(fetchBuildings)
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
      @select="setBuildingById"
      @updated="fetchBuildings"
    />

    <RoomSidebar
      :building="displayedBuilding"
      :selected-room-id="selectedRoomId"
      @select="toggleRoom"
    />
  </AppLayout>
</template>

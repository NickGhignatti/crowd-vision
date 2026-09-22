<script setup lang="ts">
import { DoubleSide } from 'three'
import type { GroundExtent } from '@/utils/digital-twin/sensors.ts'

defineProps<{ extent: GroundExtent; color: string }>()

// Lifts the grid off the plane so the two never fight for the same depth.
const GRID_LIFT = 0.01
</script>

<template>
  <!-- One quad and a line grid: next to nothing for a frame that is fill-bound. -->
  <TresMesh
    name="sensor-ground"
    :position="[extent.center.x, extent.center.y, extent.center.z]"
    :rotation-x="-Math.PI / 2"
  >
    <TresPlaneGeometry :args="[extent.size, extent.size]" />
    <TresMeshBasicMaterial
      :color="color"
      :opacity="0.06"
      transparent
      :depth-write="false"
      :side="DoubleSide"
    />
  </TresMesh>
  <TresGridHelper
    :args="[extent.size, extent.size, color, color]"
    :position="[extent.center.x, extent.center.y + GRID_LIFT, extent.center.z]"
  />
</template>

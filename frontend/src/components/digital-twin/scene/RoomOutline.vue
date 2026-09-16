<script setup lang="ts">
import type { Room } from '@/types/digital-twin/building.ts'

defineProps<{ room: Room; color: string }>()
</script>

<template>
  <TresGroup :position="[room.position.x, room.position.y, room.position.z]">
    <TresLineSegments :render-order="10">
      <TresEdgesGeometry>
        <TresBoxGeometry
          :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]"
        />
      </TresEdgesGeometry>
      <TresLineBasicMaterial :color="color" :line-width="2" :depth-test="true" />
    </TresLineSegments>
  </TresGroup>
</template>

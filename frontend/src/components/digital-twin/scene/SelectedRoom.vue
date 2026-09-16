<script setup lang="ts">
import type { Room } from '@/models/building.ts'
import { roomOpacity } from '@/helpers/colors.ts'

defineProps<{ room: Room; color?: string }>()

defineEmits<{ select: [roomId: string] }>()
</script>

<template>
  <TresGroup :position="[room.position.x, room.position.y, room.position.z]">
    <TresMesh @click="$emit('select', room.id)">
      <TresBoxGeometry
        :args="[room.dimensions.width, room.dimensions.height, room.dimensions.depth]"
      />
      <TresMeshLambertMaterial
        :color="color"
        :transparent="true"
        :opacity="roomOpacity(true)"
        :depth-write="false"
        :depth-test="true"
        :side="2"
      />
    </TresMesh>
  </TresGroup>
</template>

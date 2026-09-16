<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import { Color, Matrix4, type InstancedMesh, type Intersection } from 'three'
import type { Room } from '@/types/digital-twin/building.ts'
import { roomColorStandard, roomOpacity } from '@/utils/digital-twin/colors.ts'
import { applyRoomColors, applyRoomMatrices } from '@/composables/digital-twin/useInstancedRooms.ts'

interface TresEvent extends Intersection {
  stopPropagation?: () => void
}

const props = defineProps<{ rooms: Room[]; colors: Record<string, string> }>()

const emit = defineEmits<{ select: [roomId: string] }>()

const { renderer } = useTresContext()
const mesh = shallowRef<InstancedMesh | null>(null)
const scratchColor = new Color()
const scratchMatrix = new Matrix4()

const paint = (target: InstancedMesh) =>
  applyRoomColors(target, props.rooms, props.colors, scratchColor, roomColorStandard())

// Geometry is static per room set, so only a new set rebuilds matrices; a telemetry tick repaints.
watch(
  [mesh, () => props.rooms],
  ([target]) => {
    if (!target) return
    applyRoomMatrices(target, props.rooms, scratchMatrix)
    paint(target)
    renderer.invalidate()
  },
  { immediate: true, flush: 'post' },
)

watch(
  [mesh, () => props.colors],
  ([target]) => {
    if (!target) return
    paint(target)
    renderer.invalidate()
  },
  { flush: 'post' },
)

const onClick = (event: TresEvent) => {
  event.stopPropagation?.()
  const id = event.instanceId === undefined ? undefined : props.rooms[event.instanceId]?.id
  if (id) emit('select', id)
}
</script>

<template>
  <TresInstancedMesh
    v-if="rooms.length > 0"
    ref="mesh"
    :args="[undefined, undefined, rooms.length]"
    @click="onClick"
  >
    <TresBoxGeometry :args="[1, 1, 1]" />
    <TresMeshLambertMaterial
      :transparent="true"
      :opacity="roomOpacity(false)"
      :depth-write="false"
      :depth-test="true"
      :side="2"
    />
  </TresInstancedMesh>
</template>

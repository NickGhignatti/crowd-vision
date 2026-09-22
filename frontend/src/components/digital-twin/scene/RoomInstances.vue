<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  Matrix4,
  type InstancedMesh,
  type Intersection,
} from 'three'
import type { Room } from '@/types/digital-twin/building.ts'
import { renderStyleConfig } from '@/utils/digital-twin/renderStyleConfig.ts'
import type { HiddenEdges } from '@/utils/digital-twin/snapRooms.ts'
import { applyRoomColors, applyRoomMatrices } from '@/composables/digital-twin/useInstancedRooms.ts'
import { useRenderStyle } from '@/composables/digital-twin/useRenderStyle.ts'
import { useTheme } from '@/composables/commons/useTheme.ts'

interface TresEvent extends Intersection {
  stopPropagation?: () => void
}

const props = defineProps<{
  rooms: Room[]
  colors: Record<string, string>
  hiddenEdges: Record<string, HiddenEdges>
}>()

const emit = defineEmits<{ select: [roomId: string] }>()

const { renderer } = useTresContext()
const { theme } = useTheme()
const { current, style } = useRenderStyle()
const mesh = shallowRef<InstancedMesh | null>(null)
const scratchColor = new Color()
const scratchMatrix = new Matrix4()

// The parent remounts this per room count, so one buffer of that size serves every update.
const geometry = new BoxGeometry(1, 1, 1)
const flags = () => new InstancedBufferAttribute(new Float32Array(props.rooms.length * 4), 4)
const edges = { walls: flags(), corners: flags() }
geometry.setAttribute('hiddenWalls', edges.walls)
geometry.setAttribute('hiddenCorners', edges.corners)

const paint = (target: InstancedMesh) =>
  applyRoomColors(
    target,
    props.rooms,
    props.colors,
    scratchColor,
    renderStyleConfig(current.value).idleColor[theme.value],
  )

// Geometry is static per room set, so only a new set rebuilds matrices; a telemetry tick repaints.
watch(
  [mesh, () => props.rooms, () => props.hiddenEdges],
  ([target]) => {
    if (!target) return
    applyRoomMatrices(target, props.rooms, scratchMatrix)
    props.rooms.forEach((room, index) => {
      const hidden = props.hiddenEdges[room.id]
      edges.walls.setXYZW(index, ...(hidden?.walls ?? [0, 0, 0, 0]))
      edges.corners.setXYZW(index, ...(hidden?.corners ?? [0, 0, 0, 0]))
    })
    edges.walls.needsUpdate = true
    edges.corners.needsUpdate = true
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

const material = computed(() => style.value.material('room', theme.value, edges))

watch(
  [mesh, material],
  ([target, next], [, previous]) => {
    if (previous && previous !== next) previous.dispose()
    if (!target) return
    target.material = next
    renderer.invalidate()
  },
  { immediate: true, flush: 'post' },
)

// The batch remounts per building and floor; a shader left behind leaks GPU memory.
onBeforeUnmount(() => {
  material.value.dispose()
  geometry.dispose()
})

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
    name="room-shell"
    :args="[geometry, undefined, rooms.length]"
    @click="onClick"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Intersection,
} from 'three'
import type { Room } from '@/types/digital-twin/building.ts'
import { renderStyleConfig } from '@/utils/digital-twin/renderStyleConfig.ts'
import type { HiddenEdges } from '@/utils/digital-twin/snapRooms.ts'
import { applyRoomColors, applyRoomMatrices } from '@/composables/digital-twin/useInstancedRooms.ts'
import { useRenderStyle } from '@/composables/digital-twin/useRenderStyle.ts'
import { useTheme } from '@/composables/commons/useTheme.ts'
import {
  materialKey,
  selectedRoomMaterials,
} from '@/composables/digital-twin/selectedRoomMaterials.ts'
import { RENDER_STYLES } from '@/composables/digital-twin/renderStyles/index.ts'
import type { RoomMaterial } from '@/composables/digital-twin/renderStyles/types.ts'
import { createMaterialCache } from '@/utils/digital-twin/materialCache.ts'
import type { RenderStyleId } from '@/utils/digital-twin/renderStyle.ts'
import type { Theme } from '@/utils/commons/theme.ts'

interface TresEvent extends Intersection {
  stopPropagation?: () => void
}

const props = defineProps<{
  rooms: Room[]
  colors: Record<string, string>
  hiddenEdges: Record<string, HiddenEdges>
  /** Rooms collapsed inside the batch — selected or exploded — instead of removed from it. */
  hidden: Set<string>
}>()

const emit = defineEmits<{ select: [roomId: string] }>()

const { renderer, camera, scene } = useTresContext()
const { theme } = useTheme()
const { current } = useRenderStyle()
const mesh = shallowRef<InstancedMesh | null>(null)
const scratchColor = new Color()
const scratchMatrix = new Matrix4()
// Stands in for the selected-room overlay when its other-style pipeline is warmed.
const overlayGeometry = new BoxGeometry(1, 1, 1)

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
  [mesh, () => props.rooms, () => props.hiddenEdges, () => props.hidden],
  ([target]) => {
    if (!target) return
    applyRoomMatrices(target, props.rooms, scratchMatrix, props.hidden)
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

// Per mount, since the material binds this batch's own edge buffers; switching style or theme
// and back reuses the compiled pipeline instead of disposing and recompiling it.
const materials = createMaterialCache<RoomMaterial>((key) => {
  const [id, mode] = key.split(':') as [RenderStyleId, Theme]
  return RENDER_STYLES[id].material('room', mode, edges)
})
const material = computed(() => materials.get(materialKey(current.value, theme.value)))

// The first switch to another style would still compile on the click; compile it now instead,
// on throwaway meshes, so nothing on screen flickers while it builds. The probe needs an instance
// colour like the real batch — without one it has another vertex layout, so another pipeline.
watch(
  mesh,
  async (target) => {
    if (!target) return
    const view = camera.activeCamera.value
    for (const id of Object.keys(RENDER_STYLES) as RenderStyleId[]) {
      if (id === current.value) continue
      const key = materialKey(id, theme.value)
      const batch = new InstancedMesh(geometry, materials.get(key), 1)
      batch.setColorAt(0, scratchColor)
      const overlay = new Mesh(overlayGeometry, selectedRoomMaterials.get(key))
      // The scene is the third argument: lights are part of the shader, so a probe compiled
      // without it builds an unlit variant the real mesh never uses.
      await renderer.instance.compileAsync(batch, view, scene.value)
      await renderer.instance.compileAsync(overlay, view, scene.value)
    }
  },
  { flush: 'post' },
)

watch(
  [mesh, material],
  ([target, next]) => {
    if (!target) return
    target.material = next
    renderer.invalidate()
  },
  { immediate: true, flush: 'post' },
)

// The batch remounts per building and floor; a shader left behind leaks GPU memory.
onBeforeUnmount(() => {
  materials.clear()
  geometry.dispose()
  overlayGeometry.dispose()
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

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import { Raycaster, Vector2 } from 'three'
import type { Object3D } from 'three'
import type { Coordinates, Room } from '@/types/digital-twin/building.ts'
import { roomBehind, snapOnSurface } from '@/utils/digital-twin/sensors.ts'

const props = defineProps<{ rooms: Room[]; color: string; picked: Coordinates | null }>()
const emit = defineEmits<{ pick: [position: Coordinates, roomId: string | null] }>()

// Only surfaces a sensor can sit on; glows, haze, helpers and this preview are ignored.
const TARGETS = new Set(['room-shell', 'sensor-ground'])
// A press that travels further than this is an orbit drag, not a click to place.
const CLICK_SLOP_PX = 4
const PREVIEW_RADIUS = 0.2

const { renderer, camera, scene } = useTresContext()
const raycaster = new Raycaster()
const pointer = new Vector2()
const hovered = shallowRef<{ position: Coordinates; roomId: string | null } | null>(null)
let pressedAt: { x: number; y: number } | null = null

const targets = (): Object3D[] => {
  const found: Object3D[] = []
  scene.value.traverse((object) => {
    if (TARGETS.has(object.name)) found.push(object)
  })
  return found
}

const hitUnder = (event: PointerEvent) => {
  const canvas = renderer.instance.domElement
  const rect = canvas.getBoundingClientRect()
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera.activeCamera.value)
  const [hit] = raycaster.intersectObjects(targets(), false)
  if (!hit?.face) return null

  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
  const position = snapOnSurface(hit.point, normal)
  return { position, roomId: roomBehind(position, normal, props.rooms) }
}

const onMove = (event: PointerEvent) => {
  hovered.value = hitUnder(event)
  renderer.invalidate()
}

const onDown = (event: PointerEvent) => {
  pressedAt = { x: event.clientX, y: event.clientY }
}

const onUp = (event: PointerEvent) => {
  const start = pressedAt
  pressedAt = null
  if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return
  const hit = hitUnder(event)
  if (hit) emit('pick', hit.position, hit.roomId)
}

// Typed or nudged coordinates change the solid marker from outside the canvas.
watch(
  () => props.picked,
  () => renderer.invalidate(),
)

onMounted(() => {
  const canvas = renderer.instance.domElement
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.style.cursor = 'crosshair'
})

onBeforeUnmount(() => {
  const canvas = renderer.instance.domElement
  canvas.removeEventListener('pointermove', onMove)
  canvas.removeEventListener('pointerdown', onDown)
  canvas.removeEventListener('pointerup', onUp)
  canvas.style.cursor = ''
  renderer.invalidate()
})
</script>

<template>
  <TresMesh
    v-if="hovered"
    name="sensor-preview"
    :position="[hovered.position.x, hovered.position.y, hovered.position.z]"
  >
    <TresSphereGeometry :args="[PREVIEW_RADIUS, 16, 12]" />
    <TresMeshBasicMaterial :color="color" :opacity="0.35" transparent :depth-test="false" />
  </TresMesh>
  <TresMesh v-if="picked" name="sensor-preview" :position="[picked.x, picked.y, picked.z]">
    <TresSphereGeometry :args="[PREVIEW_RADIUS, 16, 12]" />
    <TresMeshBasicMaterial :color="color" :depth-test="false" />
  </TresMesh>
</template>

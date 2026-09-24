<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { useTresContext } from '@tresjs/core'
import { Html } from '@tresjs/cientos'
import { Raycaster, Vector2 } from 'three'
import type { Group } from 'three'
import { useIconTextures } from '@/composables/digital-twin/useIconTextures.ts'
import { useSpriteLayer } from '@/composables/digital-twin/useSpriteLayer.ts'
import type { SensorSprite } from '@/utils/digital-twin/sensorDraft.ts'

const props = defineProps<{
  sprites: SensorSprite[]
  theme: 'light' | 'dark'
  /** Only in edit mode, and never while a point is being picked, does a pin take clicks. */
  interactive: boolean
}>()
const emit = defineEmits<{ move: [key: string] }>()

// A pin is about a metre across, so it reads at room scale without hiding the wall behind it.
const SIZE = 1
const DISC = { light: '#ffffff', dark: '#060e20' }
const INK = { light: '#006948', dark: '#68dba9' }
const UNSAVED_INK = '#f59e0b'
// A press that travels further than this is an orbit drag, not a click on a pin.
const CLICK_SLOP_PX = 4

const { textureFor } = useIconTextures()
const group = shallowRef<Group | null>(null)
const items = computed(() =>
  props.sprites.map((sprite) => ({
    key: sprite.key,
    position: sprite.position,
    map: textureFor(
      sprite.sensorType,
      DISC[props.theme],
      sprite.unsaved ? UNSAVED_INK : INK[props.theme],
    ),
  })),
)
useSpriteLayer(group, items, SIZE, 'sensor-pin')

// Sprites made outside Tres get no Tres pointer events, so hover and click are one raycast here.
const { renderer, camera } = useTresContext()
const raycaster = new Raycaster()
const pointer = new Vector2()
const hovered = shallowRef<SensorSprite | null>(null)
let pressedAt: { x: number; y: number } | null = null

const pinUnder = (event: PointerEvent): SensorSprite | null => {
  const children = group.value?.children
  if (!children?.length) return null
  const rect = renderer.instance.domElement.getBoundingClientRect()
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera.activeCamera.value)
  const [hit] = raycaster.intersectObjects(children, false)
  return hit
    ? (props.sprites.find((sprite) => sprite.key === hit.object.userData.key) ?? null)
    : null
}

const onMove = (event: PointerEvent) => {
  const next = pinUnder(event)
  if (next?.key === hovered.value?.key) return
  hovered.value = next
  renderer.invalidate()
}
const onDown = (event: PointerEvent) => {
  pressedAt = { x: event.clientX, y: event.clientY }
}
const onUp = (event: PointerEvent) => {
  const start = pressedAt
  pressedAt = null
  if (!props.interactive || !start) return
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return
  const pin = pinUnder(event)
  if (pin) emit('move', pin.key)
}

onMounted(() => {
  const canvas = renderer.instance.domElement
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
})
onBeforeUnmount(() => {
  const canvas = renderer.instance.domElement
  canvas.removeEventListener('pointermove', onMove)
  canvas.removeEventListener('pointerdown', onDown)
  canvas.removeEventListener('pointerup', onUp)
})
</script>

<template>
  <TresGroup ref="group" />

  <!-- One overlay for whichever pin is under the pointer, instead of one per sensor. -->
  <TresGroup
    v-if="hovered"
    :position="[hovered.position.x, hovered.position.y + SIZE, hovered.position.z]"
  >
    <Html center pointer-events="none" :z-index-range="[20, 0]">
      <span
        class="whitespace-nowrap rounded-full bg-surface-container-lowest/95 px-2 py-0.5 text-[0.7rem] font-medium text-on-surface shadow-soft ring-1 ring-outline-variant backdrop-blur"
      >
        {{ hovered.name }}
      </span>
    </Html>
  </TresGroup>
</template>

<script setup lang="ts">
import { onUnmounted, toRefs, watch } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import type { PerspectiveCamera } from 'three'

const props = defineProps<{ active: boolean; camera: PerspectiveCamera | null }>()

const RADIUS = 40
const HEIGHT = 15
const SPEED = 0.35

const { active, camera } = toRefs(props)
const { onBeforeRender } = useLoop()
const { renderer } = useTresContext()

onBeforeRender(({ elapsed }) => {
  const current = camera.value
  if (!active.value || !current?.position) return
  current.position.set(
    Math.cos(elapsed * SPEED) * RADIUS,
    HEIGHT,
    Math.sin(elapsed * SPEED) * RADIUS,
  )
  current.lookAt(0, 0, 0)
})

// The canvas renders on demand, so onBeforeRender needs a frame to run in: request one per
// animation frame while rotating, instead of switching the whole scene to continuous rendering.
let pumpId = 0
const pump = () => {
  if (!active.value) return
  renderer.invalidate()
  pumpId = requestAnimationFrame(pump)
}

watch(active, (isActive) => {
  cancelAnimationFrame(pumpId)
  if (isActive) pumpId = requestAnimationFrame(pump)
})

onUnmounted(() => cancelAnimationFrame(pumpId))
</script>

<template>
  <slot />
</template>

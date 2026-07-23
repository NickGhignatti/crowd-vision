<script setup lang="ts">
import { toRefs, watch, onUnmounted } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import { PerspectiveCamera } from 'three'

const props = defineProps<{
  active: boolean
  camera: PerspectiveCamera | null
}>()

const { active, camera } = toRefs(props)
const { onBeforeRender } = useLoop()
const { renderer } = useTresContext()

onBeforeRender(({ elapsed }) => {
  const currentCamera = camera?.value

  if (active.value && currentCamera && currentCamera.position) {
    const speed = elapsed * 0.35
    const radius = 40
    const height = 15

    currentCamera.position.x = Math.cos(speed) * radius
    currentCamera.position.z = Math.sin(speed) * radius

    currentCamera.position.y = height

    currentCamera.lookAt(0, 0, 0)
  }
})

// The canvas renders on-demand, so onBeforeRender only fires when a frame is
// actually drawn. That would deadlock rotation (no frame -> no camera move ->
// no frame), so while active we request a frame every rAF tick. Each request
// paints one frame, which runs the callback above, keeping the orbit alive
// without forcing the whole scene into continuous 'always' rendering.
let pumpId = 0
const pump = () => {
  if (!active.value) return
  renderer.invalidate()
  pumpId = requestAnimationFrame(pump)
}

watch(active, (isActive) => {
  if (isActive) {
    pumpId = requestAnimationFrame(pump)
  } else {
    cancelAnimationFrame(pumpId)
  }
})

onUnmounted(() => cancelAnimationFrame(pumpId))
</script>

<template>
  <slot />
</template>

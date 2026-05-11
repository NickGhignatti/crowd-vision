<script setup lang="ts">
import { toRefs } from 'vue'
import { useLoop } from '@tresjs/core'
import { PerspectiveCamera } from 'three'

const props = defineProps<{
  active: boolean
  camera: PerspectiveCamera | null
}>()

const { active, camera } = toRefs(props)
const { onBeforeRender } = useLoop()

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
</script>

<template>
  <slot />
</template>

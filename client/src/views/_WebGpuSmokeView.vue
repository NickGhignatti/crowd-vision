<script setup lang="ts">
// Throwaway smoke-test view — verifies the WebGPU renderer wiring renders
// an InstancedMesh scene without needing auth/backend data. Deleted after use.
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import {
  createWebGPURenderer,
  isWebGPUSupported,
  SCENE_CLEAR_COLOR,
} from '@/composables/scene/useWebGPURenderer.ts'

const rendererFactory = isWebGPUSupported() ? createWebGPURenderer : undefined

const rooms: {
  id: string
  position: [number, number, number]
  scale: [number, number, number]
  color: string
}[] = [
  { id: 'a', position: [0, 0, 0], scale: [2, 2, 2], color: '#ff0000' },
  { id: 'b', position: [4, 0, 0], scale: [2, 3, 2], color: '#00ff00' },
  { id: 'c', position: [-4, 0, 0], scale: [2, 1, 2], color: '#0000ff' },
]
</script>

<template>
  <div id="smoke-status" style="position: fixed; top: 0; left: 0; z-index: 10; color: black">
    renderer: {{ rendererFactory ? 'webgpu' : 'webgl-fallback' }}
  </div>
  <TresCanvas :clear-color="SCENE_CLEAR_COLOR" window-size :renderer="rendererFactory">
    <TresPerspectiveCamera :position="[10, 10, 10]" :look-at="[0, 0, 0]" />
    <OrbitControls make-default />
    <TresAmbientLight :intensity="0.6" />
    <TresDirectionalLight :position="[10, 20, 10]" :intensity="0.8" />
    <TresMesh v-for="room in rooms" :key="room.id" :position="room.position">
      <TresBoxGeometry :args="room.scale" />
      <TresMeshLambertMaterial :color="room.color" />
    </TresMesh>
  </TresCanvas>
</template>

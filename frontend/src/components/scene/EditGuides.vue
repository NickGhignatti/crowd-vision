<script setup lang="ts">
import type { SnapGuide } from '@/composables/scene/editorGeometry.ts'

interface Props {
  guides: SnapGuide[]
  floorY: number
}

const props = defineProps<Props>()

const GUIDE_LENGTH = 100
const GUIDE_THICKNESS = 0.05
const GUIDE_COLOR = '#ec4899'

// Rendered as thin flat boxes, not a Line/LineMaterial primitive: this app's
// renderer is TresJS over WebGPU, and three.js's fat-line addon (LineMaterial,
// used by cientos's <Line2>) is a WebGL-only ShaderMaterial that WebGPURenderer
// can't translate ("NodeBuilder: Material 'LineMaterial' is not compatible"),
// which froze the tab the first time this shipped. BoxGeometry + a plain
// MeshBasicMaterial are exactly what every room in the scene already uses, so
// they're guaranteed compatible.
const boxArgsFor = (guide: SnapGuide): [number, number, number] =>
  guide.axis === 'x' ? [GUIDE_THICKNESS, GUIDE_THICKNESS, GUIDE_LENGTH] : [GUIDE_LENGTH, GUIDE_THICKNESS, GUIDE_THICKNESS]

const positionFor = (guide: SnapGuide): [number, number, number] =>
  guide.axis === 'x' ? [guide.value, props.floorY, 0] : [0, props.floorY, guide.value]
</script>

<template>
  <TresMesh
    v-for="(guide, index) in guides"
    :key="`${guide.axis}-${guide.value}-${index}`"
    :position="positionFor(guide)"
    :render-order="20"
  >
    <TresBoxGeometry :args="boxArgsFor(guide)" />
    <TresMeshBasicMaterial :color="GUIDE_COLOR" :depth-test="false" />
  </TresMesh>
</template>

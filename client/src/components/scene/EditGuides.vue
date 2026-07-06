<script setup lang="ts">
import { Line2 } from '@tresjs/cientos'
import type { SnapGuide } from '@/composables/scene/editorGeometry.ts'

interface Props {
  guides: SnapGuide[]
  floorY: number
}

const props = defineProps<Props>()

const GUIDE_HALF_LENGTH = 50
const GUIDE_COLOR = '#ec4899'

const pointsFor = (guide: SnapGuide): [number, number, number][] => {
  if (guide.axis === 'x') {
    return [
      [guide.value, props.floorY, -GUIDE_HALF_LENGTH],
      [guide.value, props.floorY, GUIDE_HALF_LENGTH],
    ]
  }
  return [
    [-GUIDE_HALF_LENGTH, props.floorY, guide.value],
    [GUIDE_HALF_LENGTH, props.floorY, guide.value],
  ]
}
</script>

<template>
  <Line2
    v-for="(guide, index) in guides"
    :key="`${guide.axis}-${guide.value}-${index}`"
    :points="pointsFor(guide)"
    :color="GUIDE_COLOR"
    :line-width="2"
  />
</template>

<script setup lang="ts">
import { Html } from '@tresjs/cientos'
import type { SensorRow } from '@/utils/digital-twin/sensorDraft.ts'
import type { Coordinates } from '@/types/digital-twin/building.ts'
import { sensorIcon } from '@/utils/digital-twin/sensors.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{
  markers: (SensorRow & { position: Coordinates })[]
  /** Device kinds switched off in the legend, or every kind when sensors are not being shown. */
  hidden: Set<string>
  /** Pins take clicks only in edit mode and never while a point is being picked. */
  interactive: boolean
}>()
const emit = defineEmits<{ move: [row: SensorRow] }>()

const round = (value: number) => Math.round(value * 10) / 10
</script>

<template>
  <TresGroup
    v-for="marker in markers"
    :key="marker.key"
    :position="[marker.position.x, marker.position.y, marker.position.z]"
  >
    <!-- DOM, not geometry: the frame is fill-bound, and a few HTML pins add no GPU work. -->
    <Html center :pointer-events="interactive ? 'auto' : 'none'" :z-index-range="[20, 0]">
      <!-- v-show, not v-if: unmounting an overlay can leave its element behind. -->
      <button
        v-show="!hidden.has(marker.sensorType)"
        type="button"
        :title="`${marker.name} — x ${round(marker.position.x)}, y ${round(marker.position.y)}, z ${round(marker.position.z)}`"
        :disabled="!interactive"
        class="flex size-7 items-center justify-center rounded-full bg-surface-container-lowest/95 text-primary shadow-soft ring-2 backdrop-blur transition-transform enabled:hover:scale-110"
        :class="
          marker.state === 'saved'
            ? 'ring-primary/60'
            : 'outline-2 outline-offset-2 outline-dashed outline-amber-500'
        "
        @click="emit('move', marker)"
      >
        <BaseIcon :name="sensorIcon(marker.sensorType)" />
      </button>
    </Html>
  </TresGroup>
</template>

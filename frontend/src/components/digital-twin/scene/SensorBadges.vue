<script setup lang="ts">
import { Html } from '@tresjs/cientos'
import type { SensorBadge } from '@/utils/digital-twin/sensors.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ badges: SensorBadge[] }>()
</script>

<template>
  <TresGroup
    v-for="badge in badges"
    :key="badge.roomId"
    :position="[badge.anchor.x, badge.anchor.y, badge.anchor.z]"
  >
    <!-- DOM, not geometry: the frame is fill-bound, and a few HTML pills add no GPU work. -->
    <Html center pointer-events="none" :z-index-range="[20, 0]">
      <span
        class="flex items-center gap-1 rounded-full bg-surface-container-lowest/90 px-1.5 py-0.5 text-[0.7rem] font-semibold text-primary shadow-soft ring-1 ring-primary/40 backdrop-blur"
      >
        <BaseIcon name="broadcast" />
        {{ badge.count }}
      </span>
    </Html>
  </TresGroup>
</template>

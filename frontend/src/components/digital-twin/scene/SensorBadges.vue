<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { Group } from 'three'
import { useIconTextures } from '@/composables/digital-twin/useIconTextures.ts'
import { useSpriteLayer } from '@/composables/digital-twin/useSpriteLayer.ts'
import type { SensorBadge } from '@/utils/digital-twin/sensors.ts'

const props = defineProps<{ badges: SensorBadge[]; theme: 'light' | 'dark' }>()

// Smaller than a pin: a badge says how many, the pins say where.
const SIZE = 0.8
const DISC = { light: '#ffffff', dark: '#060e20' }
const INK = { light: '#006948', dark: '#68dba9' }

const { countTextureFor } = useIconTextures()
const group = shallowRef<Group | null>(null)
const items = computed(() =>
  props.badges
    .filter((badge) => badge.count > 0)
    .map((badge) => ({
      key: badge.roomId,
      position: badge.anchor,
      map: countTextureFor(badge.count, DISC[props.theme], INK[props.theme]),
    })),
)
useSpriteLayer(group, items, SIZE, 'sensor-badge')
</script>

<template>
  <TresGroup ref="group" />
</template>

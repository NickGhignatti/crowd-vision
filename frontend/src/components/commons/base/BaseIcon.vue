<script setup lang="ts">
export type IconWeight = 'regular' | 'bold' | 'fill'

withDefaults(defineProps<{ name: string; weight?: IconWeight }>(), { weight: 'bold' })

const WEIGHT_CLASS: Record<IconWeight, string> = {
  regular: 'ph',
  bold: 'ph-bold',
  fill: 'ph-fill',
}
</script>

<template>
  <i :class="[WEIGHT_CLASS[weight], `ph-${name}`]" aria-hidden="true" />
</template>

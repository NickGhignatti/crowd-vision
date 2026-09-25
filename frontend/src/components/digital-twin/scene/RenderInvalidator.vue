<script setup lang="ts">
import { watch } from 'vue'
import { useTresContext } from '@tresjs/core'

// `invalidate` only exists inside TresCanvas; mount this there and feed it a value that
// changes whenever state owned outside the canvas (camera moves) needs a repaint.
const props = defineProps<{ trigger: unknown }>()

const { renderer } = useTresContext()

watch(
  () => props.trigger,
  () => renderer.invalidate(),
  { immediate: true },
)
</script>

<template>
  <slot />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useTresContext } from '@tresjs/core'

// `invalidate` only exists inside the TresCanvas context, but the state that should
// trigger a repaint (telemetry colours, camera moves) lives in ModelView's setup,
// outside that context. This component bridges the two: mount it inside <TresCanvas>
// and feed it a value that changes whenever a frame is needed.
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

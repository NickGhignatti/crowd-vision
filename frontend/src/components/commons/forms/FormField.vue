<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ label: string; hint?: string; error?: string | null; hideLabel?: boolean }>()

const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="id"
      class="text-label-header uppercase text-on-surface-variant"
      :class="hideLabel && 'sr-only'"
    >
      {{ label }}
    </label>
    <slot :id="id" :invalid="!!error" />
    <p v-if="error" class="text-label-stat text-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-label-stat text-on-surface-variant">{{ hint }}</p>
  </div>
</template>

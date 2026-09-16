<script setup lang="ts">
import StatusDot from '@/components/commons/base/StatusDot.vue'

defineProps<{ active: boolean; label: string }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-label-stat font-semibold uppercase tracking-wider"
    :class="active ? 'text-primary' : 'text-error'"
    role="status"
  >
    <StatusDot :tone="active ? 'primary' : 'danger'" :pulse="active" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
defineProps({
  to: {
    type: [String, Object],
    required: true,
  },
})
</script>

<template>
  <router-link
    :to="to"
    class="text-sm font-semibold text-slate-600 hover:text-emerald-600 transition-colors duration-200"
    active-class="text-emerald-600"
  >
    <slot />
  </router-link>
</template>

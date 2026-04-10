<script setup lang="ts">
defineProps<{
  label: string
  icon: string
  iconFocusClass?: string
}>()
</script>

<template>
  <div class="space-y-1.5">
    <label class="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
      {{ label }}
    </label>
    <div class="relative group">
      <i
        class="ph-bold absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors"
        :class="[icon, iconFocusClass ?? 'group-focus-within:text-emerald-500']"
      ></i>
      <slot />
    </div>
  </div>
</template>

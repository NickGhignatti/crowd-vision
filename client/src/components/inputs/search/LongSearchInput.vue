<script setup lang="ts">
defineProps<{
  placeholder?: string
}>()

const model = defineModel<string>()
</script>

<template>
  <div class="relative group">
    <i
      class="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors"
    ></i>
    <input
      v-model="model"
      type="text"
      :placeholder="placeholder"
      class="w-full sm:w-64 pl-10 pr-4 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm transition-all"
    />
  </div>
</template>

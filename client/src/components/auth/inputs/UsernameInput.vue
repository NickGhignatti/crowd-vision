<template>
  <div>
    <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Username</label>
    <input
      type="text"
      class="w-full px-4 py-2.5 bg-white rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-700 placeholder:text-slate-400 font-medium shadow-sm"
      placeholder="admin"
      v-model="username"
      required
    />
  </div>
</template>

<script setup lang="ts">
const username = defineModel<string>('username');
</script>

<template>
  <aside class="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shadow-xl z-10 h-full">
    <!-- Header -->
    <div class="p-5 border-b border-slate-800">
      <h1 class="text-xl font-bold text-cyan-400 flex items-center gap-2">
        <i class="ph-fill ph-buildings"></i> School Vis
      </h1>
      <p class="text-xs text-slate-500 mt-1">MEVN Scene Manager</p>
    </div>

    <div class="p-5 space-y-6 flex-1 overflow-y-auto">
      <!-- Stats -->
      <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div class="text-xs uppercase tracking-wider text-slate-500 mb-1">Total Occupants</div>
        <div class="text-3xl font-bold text-white">{{ totalStudents }}</div>
      </div>
      <!-- Global Actions -->
      <div>
        <label class="text-xs font-semibold text-slate-400 mb-2 block">Global Actions</label>
        <div class="grid grid-cols-2 gap-2">
          <button @click="$emit('add-random')" class="bg-cyan-600 hover:bg-cyan-500 text-white py-2 rounded transition flex items-center justify-center gap-1 text-sm font-medium">
            <i class="ph-bold ph-plus"></i> Random
          </button>
          <button @click="$emit('clear-all')" class="bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/30 py-2 rounded transition flex items-center justify-center gap-1 text-sm font-medium">
            <i class="ph-bold ph-trash"></i> Clear
          </button>
        </div>
      </div>

      <!-- Settings -->
      <div>
        <label class="text-xs font-semibold text-slate-400 mb-2 block">Scene Settings</label>
        <div class="space-y-2">
          <button @click="$emit('reset-camera')" class="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-2 px-3 rounded text-sm flex items-center justify-between transition">
            <span>Reset Camera</span>
            <i class="ph-bold ph-camera-rotate"></i>
          </button>
          <button @click="$emit('toggle-roof')" class="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-2 px-3 rounded text-sm flex items-center justify-between transition">
            <span>Toggle Roof</span>
            <i :class="showRoof ? 'ph-fill ph-eye' : 'ph-fill ph-eye-slash'"></i>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  totalStudents: Number,
  showRoof: Boolean
});

defineEmits(['add-random', 'clear-all', 'reset-camera', 'toggle-roof']);
</script>

<style>
@tailwind base;
@tailwind components;
@tailwind utilities;
</style>


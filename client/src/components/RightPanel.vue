<template>
  <aside class="w-80 bg-slate-900 border-l border-slate-800 flex flex-col shadow-xl z-10 h-full">
    <div class="p-5 border-b border-slate-800">
      <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wide">Room Management</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <div v-for="(room, index) in rooms" :key="room.id"
           class="bg-slate-800 border border-slate-700 rounded-lg p-3 transition hover:border-slate-600 group">

        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full" :class="room.id === 'hallway' ? 'bg-green-400' : 'bg-blue-400'"></div>
            <span class="font-medium text-sm text-white">{{ room.name }}</span>
          </div>
          <button @click="$emit('focus-room', room)" title="Focus Camera" class="text-slate-500 hover:text-cyan-400 transition">
            <i class="ph-fill ph-crosshair text-lg"></i>
          </button>
        </div>

        <!-- Controls -->
        <div class="flex items-center justify-between bg-slate-900/50 rounded p-2">
          <div class="text-xs text-slate-400">Occupants</div>
          <div class="flex items-center gap-3">
            <button @click="$emit('remove-student', index)" class="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 transition">
              <i class="ph-bold ph-minus"></i>
            </button>

            <span class="w-6 text-center font-mono font-bold text-sm">{{ room.count }}</span>

            <button @click="$emit('add-student', index)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-700 hover:bg-cyan-600 text-white transition shadow-sm">
              <i class="ph-bold ph-plus"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  rooms: Array
});

defineEmits(['add-student', 'remove-student', 'focus-room']);
</script>

<style>
@tailwind base;
@tailwind components;
@tailwind utilities;
</style>


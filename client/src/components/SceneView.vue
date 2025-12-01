<template>
  <div ref="container" class="w-full h-full bg-black relative">
    <div class="absolute bottom-4 left-4 pointer-events-none z-10">
      <div class="bg-black/50 backdrop-blur px-3 py-1 rounded text-xs text-slate-400 border border-white/10">
        LMB: Rotate • RMB: Pan • Scroll: Zoom
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref, onMounted, onBeforeUnmount, watch
} from 'vue';
import { SchoolScene } from '../helper.js';

// Props passed from App.vue
const props = defineProps({
  roomsData: Array,
  showRoof: Boolean
});

// Expose methods to parent using defineExpose
const container = ref(null);
let sceneInstance = null;

// --- Lifecycle ---
onMounted(() => {
  if (container.value) {
    sceneInstance = new SchoolScene(container.value, props.roomsData);
    // Sync initial state
    sceneInstance.setRoofVisibility(props.showRoof);
  }
});

onBeforeUnmount(() => {
  if (sceneInstance) sceneInstance.dispose();
});

// --- Watchers ---
watch(() => props.showRoof, (newVal) => {
  if (sceneInstance) sceneInstance.setRoofVisibility(newVal);
});

// --- Public Methods (callable via Template Refs) ---
const addStudent = (roomIndex) => sceneInstance?.addStudentToRoom(roomIndex);
const removeStudent = (roomIndex) => sceneInstance?.removeStudentFromRoom(roomIndex);
const clearAll = () => sceneInstance?.clearAll();
const focusRoom = (x, z) => sceneInstance?.focusOn(x, z);
const resetCamera = () => sceneInstance?.resetCamera();
const resize = () => sceneInstance?.onResize();

defineExpose({
  addStudent,
  removeStudent,
  clearAll,
  focusRoom,
  resetCamera,
  resize
});
</script>

<style>
@tailwind base;
@tailwind components;
@tailwind utilities;
</style>


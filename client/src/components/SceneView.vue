<template>
  <div ref="container" class="w-full h-full bg-black relative">
    <div class="absolute bottom-4 left-4 pointer-events-none z-10">
      <div class="bg-black/50 backdrop-blur px-3 py-1 rounded text-xs text-slate-400 border border-white/10">
        LMB: Rotate • RMB: Pan • Scroll: Zoom
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { SchoolScene, type RoomData } from '../scripts/utils.ts';

// Props
const props = defineProps<{
  roomsData: RoomData[];
  showRoof: boolean;
}>();

const container = ref<HTMLDivElement | null>(null);
let sceneInstance: SchoolScene | null = null;

// --- Lifecycle ---
onMounted(() => {
  if (container.value) {
    // Pass the raw array to the scene helper
    sceneInstance = new SchoolScene(container.value, props.roomsData);
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

// --- Public Methods ---
const addStudent = (roomIndex: number) => sceneInstance?.addStudentToRoom(roomIndex);
const removeStudent = (roomIndex: number) => sceneInstance?.removeStudentFromRoom(roomIndex);
const clearAll = () => sceneInstance?.clearAll();
const focusRoom = (x: number, z: number) => sceneInstance?.focusOn(x, z);
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

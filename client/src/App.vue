<template>
  <div class="flex h-screen text-slate-200 font-sans bg-slate-950 overflow-hidden">
    <LeftPanel
      :total-students="totalStudents"
      :show-roof="showRoof"
      @add-random="addRandomStudent"
      @clear-all="clearAllStudents"
      @reset-camera="handleResetCamera"
      @toggle-roof="showRoof = !showRoof"
    />

    <main class="flex-1 relative h-full">
      <SceneView
        ref="sceneRef"
        :rooms-data="rooms"
        :show-roof="showRoof"
      />
    </main>

    <RightPanel
      :rooms="rooms"
      @add-student="addStudentToRoom"
      @remove-student="removeStudentFromRoom"
      @focus-room="handleFocusRoom"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue';
import LeftPanel from './components/LeftPanel.vue';
import RightPanel from './components/RightPanel.vue';
import SceneView from './components/SceneView.vue';
import type { RoomData } from './scripts/utils.ts';


const sceneRef = ref<any>(null);
const showRoof = ref(true);

const rooms = reactive<RoomData[]>([
  {
    id: 'hallway',
    name: 'Main Corridor',
    count: 0,
    x: 0,
    z: 0,
    w: 12,
    d: 2.5
  },
  {
    id: 'room1',
    name: 'Classroom A',
    count: 0,
    x: -4,
    z: -3.5,
    w: 3.5,
    d: 4
  },
  {
    id: 'room2',
    name: 'Classroom B',
    count: 0,
    x: 4,
    z: -3.5,
    w: 3.5,
    d: 4
  },
  {
    id: 'room3',
    name: 'Classroom C',
    count: 0,
    x: -4,
    z: 3.5,
    w: 3.5,
    d: 4
  },
  {
    id: 'room4',
    name: 'Classroom D',
    count: 0,
    x: 4,
    z: 3.5,
    w: 3.5,
    d: 4
  },
]);

const totalStudents = computed(() => rooms.reduce((sum, r) => sum + r.count, 0));

const addStudentToRoom = (index: number) => {
  if (index < rooms.length) {
    rooms[index]!.count++;
    sceneRef.value?.addStudent(index);
  }
};

const removeStudentFromRoom = (index: number) => {
  if (index < rooms.length - 1 && rooms[index]!.count > 0) {
    rooms[index]!.count--;
    sceneRef.value?.removeStudent(index);
  }
};

const addRandomStudent = () => {
  const randomIndex = Math.floor(Math.random() * rooms.length);
  addStudentToRoom(randomIndex);
};

const clearAllStudents = () => {
  rooms.forEach(r => r.count = 0);
  sceneRef.value?.clearAll();
};

const handleFocusRoom = (room: RoomData) => {
  sceneRef.value?.focusRoom(room.x, room.z);
};

const handleResetCamera = () => {
  sceneRef.value?.resetCamera();
};

const triggerResize = () => {
  nextTick(() => sceneRef.value?.resize());
};
</script>

<style>
@tailwind base;
@tailwind components;
@tailwind utilities;
</style>

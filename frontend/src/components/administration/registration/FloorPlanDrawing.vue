<script setup lang="ts">
import type { RoomDraft } from '@/types/administration/buildingDraft.ts'
import { roomOrigin } from '@/utils/administration/floorplan/preview.ts'

defineProps<{ rooms: RoomDraft[]; viewBox: string }>()

// The drawing keeps a paper-white ground in both themes, so these stay fixed colours.
const FILLS = ['#cfe8ff', '#ffe9c7', '#d8f5d0', '#e9d5ff', '#fed7aa', '#bae6fd', '#fecaca']

const round = (value: number) => Math.round(value * 10) / 10
</script>

<template>
  <svg :viewBox="viewBox" class="max-h-[55vh] w-full" role="img">
    <g
      v-for="(room, index) in rooms"
      :key="room.id"
      :transform="`translate(${roomOrigin(room).x}, ${roomOrigin(room).z})`"
    >
      <rect
        :width="room.dimensions.width"
        :height="room.dimensions.depth"
        :fill="room.color ?? FILLS[index % FILLS.length]"
        stroke="#334155"
        stroke-width="0.12"
        rx="0.15"
      />
      <text
        :x="room.dimensions.width / 2"
        :y="room.dimensions.depth / 2"
        text-anchor="middle"
        fill="#0f172a"
        font-size="0.85"
      >
        {{ room.name }}
      </text>
      <text
        :x="room.dimensions.width / 2"
        :y="room.dimensions.depth / 2 + 1"
        text-anchor="middle"
        fill="#64748b"
        font-size="0.65"
      >
        {{ round(room.dimensions.width) }} × {{ round(room.dimensions.depth) }} m
      </text>
    </g>
  </svg>
</template>

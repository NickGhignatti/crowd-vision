<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Room } from '@/models/building.ts'
import { roomColorByAirQuality, roomColorByTemperature } from '@/helpers/colors.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import ProgressBar from '@/components/commons/base/ProgressBar.vue'

const props = defineProps<{
  room: Room
  selected: boolean
  canEdit: boolean
  temperature?: number
  people?: number
  airQuality?: number
}>()

defineEmits<{ select: []; edit: [] }>()

const { t } = useI18n()
const EMPTY = '—'

const occupancy = computed(() =>
  props.people === undefined || !props.room.capacity ? null : props.people / props.room.capacity,
)
</script>

<template>
  <article
    class="overflow-hidden rounded-2xl bg-surface-container-lowest transition-all"
    :class="
      selected
        ? 'shadow-soft ring-2 ring-primary/60'
        : 'ring-1 ring-outline-variant/60 hover:shadow-soft'
    "
  >
    <div
      role="button"
      tabindex="0"
      class="cursor-pointer space-y-3 p-3"
      :aria-pressed="selected"
      @click="$emit('select')"
      @keydown.enter.prevent="$emit('select')"
      @keydown.space.prevent="$emit('select')"
    >
      <header class="flex items-center gap-2">
        <span
          v-if="room.color"
          class="size-3 shrink-0 rounded-full ring-2 ring-surface-container"
          :style="{ backgroundColor: room.color }"
        />
        <h3 class="min-w-0 flex-1 truncate text-body-md font-semibold">{{ room.name }}</h3>
        <IconButton
          v-if="canEdit"
          icon="pencil-simple"
          size="sm"
          :label="t('model.rooms.editRoom.title')"
          @click.stop="$emit('edit')"
        />
      </header>

      <dl class="grid grid-cols-2 gap-2 text-label-stat">
        <div class="rounded-lg bg-surface-container-low px-2 py-1.5">
          <dt class="flex items-center gap-1 text-on-surface-variant">
            <BaseIcon name="thermometer" />
            {{ t('model.rooms.temperature') }}
          </dt>
          <dd
            class="text-mono-metric"
            :style="{
              color: temperature === undefined ? undefined : roomColorByTemperature(temperature),
            }"
          >
            {{ temperature === undefined ? EMPTY : `${temperature.toFixed(1)}°C` }}
          </dd>
        </div>
        <div class="rounded-lg bg-surface-container-low px-2 py-1.5">
          <dt class="flex items-center gap-1 text-on-surface-variant">
            <BaseIcon name="wind" />
            AQI
          </dt>
          <dd
            class="text-mono-metric"
            :style="{
              color: airQuality === undefined ? undefined : roomColorByAirQuality(airQuality),
            }"
          >
            {{ airQuality ?? EMPTY }}
          </dd>
        </div>
        <div class="col-span-2 space-y-1 rounded-lg bg-surface-container-low px-2 py-1.5">
          <dt class="flex items-center justify-between text-on-surface-variant">
            <span class="flex items-center gap-1">
              <BaseIcon name="users" />
              {{ t('model.rooms.occupancy') }}
            </span>
            <span class="tabular-nums text-on-surface"
              >{{ people ?? EMPTY }} / {{ room.capacity }}</span
            >
          </dt>
          <dd><ProgressBar :value="occupancy" :label="t('model.rooms.occupancy')" /></dd>
        </div>
      </dl>
    </div>
  </article>
</template>

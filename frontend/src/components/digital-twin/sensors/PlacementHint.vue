<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSensorEditor } from '@/composables/digital-twin/useSensorEditor.ts'
import { nudge } from '@/utils/digital-twin/sensors.ts'
import type { Coordinates } from '@/types/digital-twin/building.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const { t } = useI18n()
const { pendingPlacement, candidate, cancelPlacing, moveCandidate, confirmPlacement } =
  useSensorEditor()

const AXES = ['x', 'y', 'z'] as const

const setAxis = (axis: (typeof AXES)[number], raw: string) => {
  const value = Number(raw)
  if (!candidate.value || raw.trim() === '' || !Number.isFinite(value)) return
  moveCandidate({ ...candidate.value.position, [axis]: value } as Coordinates)
}

const onKey = (event: KeyboardEvent) => {
  if (!pendingPlacement.value) return
  if (event.key === 'Escape') return cancelPlacing()
  if (event.key === 'Enter' && candidate.value) {
    event.preventDefault()
    return confirmPlacement()
  }
  // Inside a number field the arrows already step that one value.
  if (!candidate.value || event.target instanceof HTMLInputElement) return
  const moved = nudge(candidate.value.position, event.key, event.shiftKey)
  if (!moved) return
  event.preventDefault()
  moveCandidate(moved)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    v-if="pendingPlacement"
    role="status"
    class="surface-card flex w-full flex-col gap-2 rounded-2xl bg-primary px-4 py-2 text-sm text-on-primary shadow-lift"
  >
    <div class="flex items-center gap-2">
      <BaseIcon name="crosshair" />
      <span class="flex-1">
        {{
          candidate
            ? t('model.sensors.adjustHint', { name: pendingPlacement.name })
            : t(
                pendingPlacement.moving ? 'model.sensors.movingHint' : 'model.sensors.placingHint',
                {
                  name: pendingPlacement.name,
                },
              )
        }}
      </span>
      <button
        type="button"
        class="rounded-full px-2 py-0.5 font-medium hover:bg-on-primary/15"
        @click="cancelPlacing"
      >
        {{ t('commons.cancel') }}
      </button>
    </div>

    <template v-if="candidate">
      <div class="grid grid-cols-3 gap-2">
        <label v-for="axis in AXES" :key="axis" class="flex min-w-0 items-center gap-1">
          <span class="font-mono uppercase">{{ axis }}</span>
          <input
            type="number"
            step="0.5"
            class="w-full min-w-0 rounded bg-on-primary/15 px-1.5 py-0.5 text-on-primary focus:outline-none focus:ring-1 focus:ring-on-primary"
            :value="candidate.position[axis]"
            :aria-label="t('model.sensors.axisLabel', { axis })"
            @change="setAxis(axis, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <button
        type="button"
        class="w-full rounded-full bg-on-primary px-3 py-1 font-medium text-primary"
        @click="confirmPlacement"
      >
        {{ pendingPlacement.moving ? t('model.sensors.moveHere') : t('model.sensors.placeHere') }}
      </button>
    </template>
  </div>
</template>

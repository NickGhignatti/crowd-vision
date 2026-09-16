<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RoomDraft } from '@/models/buildingDraft.ts'
import { floorsByElevation, planExtent } from '@/utils/building/floorplan/preview.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import SegmentedControl from '@/components/commons/base/SegmentedControl.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'
import FloorPlanDrawing from '@/components/administration/registration/FloorPlanDrawing.vue'

const props = defineProps<{ open: boolean; rooms: RoomDraft[] }>()

defineEmits<{ close: [] }>()

const PADDING = 1

const { t } = useI18n()
const selected = ref('0')

watch(
  () => props.open,
  (open) => {
    if (open) selected.value = '0'
  },
)

const floors = computed(() => floorsByElevation(props.rooms))
const extent = computed(() => planExtent(props.rooms, PADDING))
const current = computed(() => floors.value[Number(selected.value)] ?? null)
const floorOptions = computed(() =>
  floors.value.map((floor) => ({
    value: String(floor.index),
    label: t('model.register.plan.floorRow', { index: floor.index }),
  })),
)

const round = (value: number) => Math.round(value * 10) / 10
</script>

<template>
  <BaseModal
    :open="open"
    size="xl"
    icon="eye"
    :title="t('model.register.preview.title')"
    :subtitle="t('model.register.preview.hint')"
    @close="$emit('close')"
  >
    <EmptyState
      v-if="!extent || !current"
      icon="blueprint"
      :title="t('model.register.preview.empty')"
    />

    <div v-else class="space-y-4">
      <SegmentedControl
        v-if="floors.length > 1"
        v-model="selected"
        size="sm"
        :options="floorOptions"
        :label="t('model.controls.floorSelection')"
      />
      <div class="overflow-x-auto rounded-2xl bg-white p-3 ring-1 ring-outline-variant/60">
        <FloorPlanDrawing :rooms="current.rooms" :view-box="extent.viewBox" />
      </div>
      <p class="text-body-sm text-on-surface-variant">
        {{
          t('model.register.preview.summary', {
            rooms: current.rooms.length,
            width: round(extent.width),
            depth: round(extent.depth),
          })
        }}
      </p>
    </div>
  </BaseModal>
</template>

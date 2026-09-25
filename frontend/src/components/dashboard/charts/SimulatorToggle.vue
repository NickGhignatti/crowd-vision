<script setup lang="ts">
import { onMounted, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toggleSimulator, useIsRunning } from '@/composables/dashboard/simulator.ts'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import StatusDot from '@/components/commons/base/StatusDot.vue'

const props = defineProps<{ buildingId?: string; roomIds: string[] }>()

const { t } = useI18n()
const { isSimRunning, refetch } = useIsRunning(toRef(props, 'buildingId'))

// The simulator reports its new state a moment after the toggle returns.
const SETTLE_MS = 500

const toggle = async () => {
  if (!props.buildingId) return
  try {
    await toggleSimulator(props.buildingId, isSimRunning.value ? 'stop' : 'start', props.roomIds)
    isSimRunning.value = !isSimRunning.value
    setTimeout(refetch, SETTLE_MS)
  } catch (error) {
    console.error('Simulator toggle failed', error)
    refetch()
  }
}

onMounted(refetch)
</script>

<template>
  <BaseButton
    size="sm"
    :variant="isSimRunning ? 'tonal' : 'secondary'"
    :disabled="!buildingId"
    @click="toggle"
  >
    <StatusDot v-if="isSimRunning" pulse />
    {{
      isSimRunning ? t('dashboard.table.buttons.simStop') : t('dashboard.table.buttons.simStart')
    }}
  </BaseButton>
</template>

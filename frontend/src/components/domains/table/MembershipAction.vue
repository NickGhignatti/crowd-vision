<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineProps<{ isPrivate: boolean; isMember: boolean; busy: boolean }>()

defineEmits<{ join: []; leave: [] }>()

const { t } = useI18n()
</script>

<template>
  <span
    v-if="isPrivate"
    class="inline-flex items-center gap-1 text-label-stat text-on-surface-variant"
    :title="t('domains.labels.memberLabel')"
  >
    <BaseIcon name="lock-key" class="text-base" />
    {{ t('domains.labels.memberLabel') }}
  </span>
  <BaseButton
    v-else-if="isMember"
    size="sm"
    variant="ghost"
    icon="user-minus"
    :loading="busy"
    @click="$emit('leave')"
  >
    {{ t('domains.actions.leave') }}
  </BaseButton>
  <BaseButton
    v-else
    size="sm"
    variant="tonal"
    icon="user-plus"
    :loading="busy"
    @click="$emit('join')"
  >
    {{ t('domains.actions.join') }}
  </BaseButton>
</template>

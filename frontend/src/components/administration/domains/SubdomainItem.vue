<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import AlertSubscriptionMenu from '@/components/administration/domains/AlertSubscriptionMenu.vue'

defineProps<{
  name: string
  label: string
  parent: string
  selected: boolean
  canUpload: boolean
}>()

defineEmits<{ select: []; upload: [] }>()

const { t } = useI18n()
</script>

<template>
  <li
    class="group flex items-center gap-2 rounded-xl bg-surface-container-lowest py-1.5 pl-3 pr-1.5 transition-shadow"
    :class="selected ? 'ring-2 ring-primary/50' : 'hover:shadow-soft'"
  >
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2 text-left"
      @click="$emit('select')"
    >
      <BaseIcon name="arrow-elbow-down-right" class="text-outline" />
      <span class="truncate text-body-sm">
        <span class="font-semibold text-on-surface">{{ label }}</span>
        <span class="text-on-surface-variant">.{{ parent }}</span>
      </span>
    </button>
    <AlertSubscriptionMenu :domain-name="name" size="sm" />
    <IconButton
      v-if="canUpload"
      icon="upload-simple"
      size="sm"
      :label="t('administration.registerBuilding')"
      @click="$emit('upload')"
    />
  </li>
</template>

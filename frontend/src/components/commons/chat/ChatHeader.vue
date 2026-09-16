<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'

defineEmits<{ close: [] }>()

const { t } = useI18n()
</script>

<template>
  <header class="flex items-center justify-between bg-primary px-4 py-3 text-on-primary">
    <div class="flex items-center gap-2.5">
      <span class="flex size-8 items-center justify-center rounded-lg bg-on-primary/15 text-lg">
        <BaseIcon name="sparkle" />
      </span>
      <div class="leading-tight">
        <p class="text-body-md font-semibold">{{ t('chat.title') }}</p>
        <p class="text-label-stat opacity-80">{{ t('chat.subtitle') }}</p>
      </div>
    </div>
    <IconButton
      icon="x"
      variant="on-primary"
      size="sm"
      :label="t('chat.close')"
      @click="$emit('close')"
    />
  </header>
</template>

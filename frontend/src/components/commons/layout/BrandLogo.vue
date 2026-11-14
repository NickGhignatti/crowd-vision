<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const { t } = useI18n()
</script>

<template>
  <RouterLink
    to="/"
    class="flex shrink-0 items-center gap-2 rounded-lg text-on-surface"
    :aria-label="t('commons.app.ambitwin')"
  >
    <span
      class="flex size-8 items-center justify-center rounded-lg bg-primary text-xl text-on-primary shadow-soft"
    >
      <BaseIcon name="buildings" />
    </span>
    <span class="text-headline-md">
      {{ t('commons.app.ambi') }}<span class="text-primary">{{ t('commons.app.twin') }}</span>
    </span>
  </RouterLink>
</template>

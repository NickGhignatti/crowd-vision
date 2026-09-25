<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BrandLogo from '@/components/commons/layout/BrandLogo.vue'

const { t } = useI18n()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="bg-surface-container-lowest">
    <div
      class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 md:flex-row md:px-margin"
    >
      <BrandLogo />
      <p class="text-body-sm text-on-surface-variant">© {{ year }} {{ t('commons.app.rights') }}</p>
    </div>
  </footer>
</template>

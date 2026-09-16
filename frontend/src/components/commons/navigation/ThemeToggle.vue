<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/ui/useTheme.ts'
import IconButton from '@/components/commons/base/IconButton.vue'

const { t } = useI18n()
const { theme, toggle } = useTheme()
</script>

<template>
  <IconButton
    :icon="theme === 'dark' ? 'sun' : 'moon'"
    :label="t(theme === 'dark' ? 'commons.theme.light' : 'commons.theme.dark')"
    @click="toggle"
  />
</template>

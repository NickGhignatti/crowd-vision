<script setup lang="ts">
import { useDateTime } from '@/composables/useDateTime.ts'
import { useI18n } from 'vue-i18n'
const { locale } = useI18n()

defineProps({
  as: {
    type: String,
    default: 'p',
  },
  className: {
    type: String,
    default: '',
  },
})

const { formattedDate } = useDateTime(locale)
</script>

<template>
  <component :is="as" :class="className">
    {{ formattedDate }}
  </component>
</template>

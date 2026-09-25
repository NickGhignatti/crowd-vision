<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getRoleMeta } from '@/utils/domains/roles.ts'
import BaseBadge from '@/components/commons/base/BaseBadge.vue'

const props = defineProps<{ role: string; size?: 'sm' | 'md' }>()

const { t } = useI18n()
const meta = computed(() => getRoleMeta(props.role))
</script>

<template>
  <BaseBadge :tone="meta.tone" :size="size">{{ t(meta.i18nKey) }}</BaseBadge>
</template>

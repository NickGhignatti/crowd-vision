<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatCitation } from '@/types/commons/chat.ts'
import { uniqueSources } from '@/utils/commons/chat.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const props = defineProps<{ citations: ChatCitation[] }>()

const { t } = useI18n()
const sources = computed(() => uniqueSources(props.citations))
</script>

<template>
  <div class="mt-1.5 max-w-[85%] px-1">
    <p class="mb-1 flex items-center gap-1 text-[11px] font-medium text-on-surface-variant">
      <BaseIcon name="books" />
      {{ t('chat.sources') }}
    </p>
    <ul class="flex flex-col items-start gap-1">
      <li
        v-for="source in sources"
        :key="`${source.source}::${source.section}`"
        class="inline-flex items-start gap-1 rounded-lg bg-secondary-container px-2 py-1 text-[11px] leading-snug text-on-secondary-container"
      >
        <BaseIcon name="file-text" class="mt-0.5 shrink-0" />
        <span class="break-words">
          <span class="font-medium">{{ source.label }}</span>
          <span v-if="source.section" class="opacity-70"> · {{ source.section }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

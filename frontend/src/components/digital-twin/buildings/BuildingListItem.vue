<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'

defineProps<{ name: string; selected: boolean; canEdit: boolean }>()

defineEmits<{ select: []; edit: [] }>()

const { t } = useI18n()
</script>

<template>
  <div
    class="rounded-2xl transition-colors"
    :class="selected ? 'bg-primary/8 ring-1 ring-primary/30' : 'hover:bg-surface-container-low'"
  >
    <div class="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        :aria-current="selected || undefined"
        @click="$emit('select')"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-xl text-base"
          :class="
            selected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
          "
        >
          <BaseIcon name="building-office" />
        </span>
        <span class="min-w-0 truncate text-body-sm font-semibold">{{ name }}</span>
      </button>
      <IconButton
        v-if="selected && canEdit"
        icon="pencil-simple"
        size="sm"
        :label="t('commons.edit')"
        @click="$emit('edit')"
      />
    </div>
    <div v-if="selected && $slots.default" class="px-3 pb-3">
      <slot />
    </div>
  </div>
</template>

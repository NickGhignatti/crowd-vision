<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'

const props = defineProps<{ title: string; icon: string; side: 'left' | 'right' }>()

const open = defineModel<boolean>('open', { default: true })

const { t } = useI18n()

const collapseIcon = props.side === 'left' ? 'caret-left' : 'caret-right'
</script>

<template>
  <Transition
    mode="out-in"
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <aside
      v-if="open"
      class="surface-card absolute top-4 z-30 flex w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl bg-surface-container-lowest/90 shadow-lift backdrop-blur-md sm:w-80"
      :class="side === 'left' ? 'bottom-24 left-4' : 'bottom-24 right-4 lg:bottom-4'"
      :aria-label="title"
    >
      <header class="flex items-center gap-2 px-4 pb-2 pt-4">
        <BaseIcon :name="icon" class="text-lg text-primary" />
        <h2 class="min-w-0 flex-1 truncate text-title-sm">{{ title }}</h2>
        <slot name="actions" />
        <IconButton
          :icon="collapseIcon"
          size="sm"
          :label="t('commons.collapse')"
          @click="open = false"
        />
      </header>
      <div v-if="$slots.toolbar" class="px-3 pb-2">
        <slot name="toolbar" />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <slot />
      </div>
    </aside>

    <button
      v-else
      type="button"
      class="surface-card absolute top-4 z-30 flex items-center gap-2 rounded-full px-4 py-2 text-body-sm font-medium shadow-lift transition-colors hover:text-primary"
      :class="side === 'left' ? 'left-4' : 'right-4'"
      :aria-label="t('commons.expand')"
      @click="open = true"
    >
      <BaseIcon :name="icon" class="text-lg text-primary" />
      {{ title }}
    </button>
  </Transition>
</template>

<script setup lang="ts">
import { nextTick, ref, toRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    icon?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
  }>(),
  { size: 'md' },
)

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const titleId = useId()
const panel = ref<HTMLElement | null>(null)

const WIDTH = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close')
}

watch(
  toRef(props, 'open'),
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    panel.value?.focus()
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          class="surface-card flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl shadow-lift outline-none"
          :class="WIDTH[size]"
          @keydown="onKeyDown"
        >
          <header class="flex items-start gap-3 px-6 pb-2 pt-6">
            <span
              v-if="icon"
              class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl text-primary"
            >
              <BaseIcon :name="icon" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 :id="titleId" class="text-title-sm text-on-surface">{{ title }}</h2>
              <p v-if="subtitle" class="mt-0.5 text-body-sm text-on-surface-variant">
                {{ subtitle }}
              </p>
            </div>
            <IconButton icon="x" :label="t('commons.close')" size="sm" @click="emit('close')" />
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="flex items-center justify-end gap-2 px-6 pb-6 pt-2">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

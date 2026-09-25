<script setup lang="ts">
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

export type IconButtonVariant = 'ghost' | 'outlined' | 'filled' | 'danger' | 'on-primary'

withDefaults(
  defineProps<{
    icon: string
    label: string
    variant?: IconButtonVariant
    size?: 'sm' | 'md' | 'lg'
    active?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'ghost', size: 'md', type: 'button' },
)

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary',
  outlined:
    'bg-surface-container-lowest text-on-surface-variant shadow-soft ring-1 ring-outline-variant/70 hover:text-primary',
  filled: 'bg-primary text-on-primary shadow-soft hover:bg-primary-container',
  danger: 'text-on-surface-variant hover:bg-error-container hover:text-on-error-container',
  'on-primary': 'text-on-primary hover:bg-on-primary/15',
}

const SIZE = { sm: 'size-7 text-base', md: 'size-9 text-lg', lg: 'size-11 text-xl' }
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :title="label"
    :aria-label="label"
    :aria-pressed="active ?? undefined"
    class="relative inline-flex shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-40"
    :class="[
      SIZE[size],
      active ? 'bg-secondary-container text-on-secondary-container' : VARIANT[variant],
    ]"
  >
    <BaseIcon :name="icon" />
    <slot />
  </button>
</template>

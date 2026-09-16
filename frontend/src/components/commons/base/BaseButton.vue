<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    icon?: string
    iconRight?: string
    loading?: boolean
    disabled?: boolean
    block?: boolean
    type?: 'button' | 'submit' | 'reset'
    /** Renders a router link instead of a button. */
    to?: RouteLocationRaw
    /** Renders an external link instead of a button. */
    href?: string
  }>(),
  { variant: 'secondary', size: 'md', type: 'button' },
)

const tag = computed(() => (props.to ? RouterLink : props.href ? 'a' : 'button'))
const linkAttrs = computed(() =>
  props.to
    ? { to: props.to }
    : props.href
      ? { href: props.href, target: '_blank', rel: 'noopener noreferrer' }
      : { type: props.type, disabled: props.disabled || props.loading },
)

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary shadow-soft hover:bg-primary-container hover:text-on-primary-container',
  secondary:
    'bg-surface-container-lowest text-on-surface shadow-soft ring-1 ring-outline-variant/70 hover:bg-surface-container-low',
  tonal: 'bg-secondary-container text-on-secondary-container hover:brightness-95',
  ghost: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  danger: 'bg-error text-on-error shadow-soft hover:brightness-110',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-body-sm',
  md: 'h-10 px-4 text-body-sm',
  lg: 'h-11 px-5 text-body-md font-semibold',
}
</script>

<template>
  <component
    :is="tag"
    v-bind="linkAttrs"
    :aria-busy="loading || undefined"
    class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
    :class="[VARIANT[variant], SIZE[size], block && 'w-full']"
  >
    <BaseIcon v-if="loading" name="circle-notch" class="animate-spin text-[1.15em]" />
    <BaseIcon
      v-else-if="icon"
      :name="icon"
      class="text-[1.15em]"
      :class="variant === 'secondary' && 'text-primary'"
    />
    <slot />
    <BaseIcon v-if="iconRight" :name="iconRight" class="text-[1.15em]" />
  </component>
</template>

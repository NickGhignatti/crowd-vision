<script setup lang="ts" generic="T extends string | number | null">
import { computed, useAttrs } from 'vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

export interface SelectOption<V> {
  value: V
  label: string
}

defineOptions({ inheritAttrs: false })

// Layout classes size the wrapper; every other attribute belongs to the native control.
const attrs = useAttrs()
const controlAttrs = computed(() => ({ ...attrs, class: undefined }))

withDefaults(
  defineProps<{
    options: SelectOption<T>[]
    icon?: string
    size?: 'sm' | 'md' | 'lg'
    tone?: 'filled' | 'plain'
  }>(),
  { size: 'md', tone: 'filled' },
)

const model = defineModel<T>()

const SIZE = { sm: 'h-8', md: 'h-10', lg: 'h-11 text-title-sm' }
</script>

<template>
  <div class="group relative inline-flex w-full items-center" :class="attrs.class">
    <BaseIcon
      v-if="icon"
      :name="icon"
      class="pointer-events-none absolute left-3 text-lg text-primary"
    />
    <select
      v-model="model"
      v-bind="controlAttrs"
      class="field cursor-pointer appearance-none truncate pr-9"
      :class="[SIZE[size], icon && 'pl-9', tone === 'plain' && 'bg-surface-container-lowest']"
    >
      <option v-for="option in options" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <BaseIcon
      name="caret-up-down"
      class="pointer-events-none absolute right-3 text-base text-on-surface-variant"
    />
  </div>
</template>

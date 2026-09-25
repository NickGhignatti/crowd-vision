<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

defineOptions({ inheritAttrs: false })

// Layout classes size the wrapper; every other attribute belongs to the native control.
const attrs = useAttrs()
const controlAttrs = computed(() => ({ ...attrs, class: undefined }))

withDefaults(
  defineProps<{
    icon?: string
    type?: 'text' | 'email' | 'password' | 'number' | 'search'
    size?: 'sm' | 'md' | 'lg'
    invalid?: boolean
  }>(),
  { type: 'text', size: 'md' },
)

const model = defineModel<string | number | null>()
const input = ref<HTMLInputElement | null>(null)

defineExpose({ focus: () => input.value?.focus() })

const SIZE = { sm: 'h-8', md: 'h-10', lg: 'h-11 text-body-md' }
</script>

<template>
  <div class="group relative flex w-full items-center" :class="attrs.class">
    <BaseIcon
      v-if="icon"
      :name="icon"
      class="pointer-events-none absolute left-3 text-lg text-outline transition-colors group-focus-within:text-primary"
    />
    <input
      ref="input"
      v-model="model"
      v-bind="controlAttrs"
      :type="type"
      :aria-invalid="invalid || undefined"
      class="field"
      :class="[
        SIZE[size],
        icon && 'pl-9',
        invalid && 'border-error focus:ring-error/30',
        $slots.trailing && 'pr-9',
      ]"
    />
    <div v-if="$slots.trailing" class="absolute right-1.5 flex items-center">
      <slot name="trailing" />
    </div>
  </div>
</template>

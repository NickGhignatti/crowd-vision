<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TextInput from '@/components/commons/forms/TextInput.vue'
import IconButton from '@/components/commons/base/IconButton.vue'

withDefaults(defineProps<{ placeholder?: string; size?: 'sm' | 'md'; label?: string }>(), {
  size: 'md',
})

const model = defineModel<string>({ default: '' })
const input = ref<InstanceType<typeof TextInput> | null>(null)
const { t } = useI18n()

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <TextInput
    ref="input"
    v-model="model"
    type="search"
    icon="magnifying-glass"
    :size="size"
    :placeholder="placeholder"
    :aria-label="label ?? placeholder"
    @keydown.esc="model = ''"
  >
    <template v-if="model" #trailing>
      <IconButton icon="x-circle" :label="t('commons.clear')" size="sm" @click="model = ''" />
    </template>
  </TextInput>
</template>

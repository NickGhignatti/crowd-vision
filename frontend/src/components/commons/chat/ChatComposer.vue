<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconButton from '@/components/commons/base/IconButton.vue'

const props = defineProps<{ disabled: boolean; sending: boolean; placeholder: string }>()

const emit = defineEmits<{ send: [question: string] }>()

const { t } = useI18n()
const draft = ref('')

const send = () => {
  const question = draft.value.trim()
  if (!question || props.disabled) return
  draft.value = ''
  emit('send', question)
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  send()
}
</script>

<template>
  <form class="flex items-end gap-2 bg-surface-container-lowest p-3" @submit.prevent="send">
    <textarea
      v-model="draft"
      rows="1"
      class="field max-h-32 min-h-9 flex-1 resize-none"
      :placeholder="placeholder"
      :aria-label="placeholder"
      :disabled="disabled"
      @keydown="onKeydown"
    />
    <IconButton
      type="submit"
      variant="filled"
      :icon="sending ? 'circle-notch' : 'paper-plane-tilt'"
      :class="sending && '[&_i]:animate-spin'"
      :label="t('chat.send')"
      :disabled="disabled || !draft.trim()"
    />
  </form>
</template>

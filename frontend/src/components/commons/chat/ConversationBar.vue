<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatConversationSummary } from '@/interfaces/chat.ts'
import IconButton from '@/components/commons/base/IconButton.vue'
import SelectInput from '@/components/commons/forms/SelectInput.vue'

const props = defineProps<{
  conversations: ChatConversationSummary[]
  activeId?: string
  busy: boolean
}>()

const emit = defineEmits<{ select: [id: string]; create: []; rename: []; delete: [] }>()

const { t } = useI18n()

const options = computed(() =>
  props.conversations.map((conversation) => ({
    value: conversation._id,
    label: conversation.title,
  })),
)

const selected = computed({
  get: () => props.activeId ?? '',
  set: (id: string) => emit('select', id),
})
</script>

<template>
  <div class="flex items-center gap-1 bg-surface-container-lowest px-3 py-2">
    <SelectInput
      v-model="selected"
      :options="options"
      size="sm"
      :disabled="busy"
      :aria-label="t('chat.conversation')"
    />
    <IconButton icon="plus" size="sm" :label="t('chat.newChat')" @click="emit('create')" />
    <IconButton
      icon="pencil-simple"
      size="sm"
      :label="t('chat.renameChat')"
      @click="emit('rename')"
    />
    <IconButton
      icon="trash"
      size="sm"
      variant="danger"
      :label="t('chat.deleteChat')"
      @click="emit('delete')"
    />
  </div>
</template>

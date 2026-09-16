<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UserAvatar from '@/components/commons/account/UserAvatar.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'

defineProps<{ name: string; email: string; picture: string; saving: boolean }>()

const emit = defineEmits<{ save: [name: string, email: string] }>()

const editing = defineModel<boolean>('editing', { required: true })

const { t } = useI18n()

// Drafts, not the shown values, take the edit, so Cancel discards it.
const draftName = ref('')
const draftEmail = ref('')

const startEditing = (name: string, email: string) => {
  draftName.value = name
  draftEmail.value = email
  editing.value = true
}
</script>

<template>
  <div v-if="!editing" class="flex items-center gap-4 rounded-2xl bg-surface-container-low p-4">
    <UserAvatar :name="name" :email="email" :picture="picture" size="lg" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-title-sm">{{ name || email }}</p>
      <p v-if="name" class="truncate text-body-sm text-on-surface-variant">{{ email }}</p>
    </div>
    <IconButton
      icon="pencil-simple"
      :label="t('authentication.editProfile')"
      @click="startEditing(name, email)"
    />
  </div>

  <form v-else class="space-y-4" @submit.prevent="emit('save', draftName, draftEmail)">
    <UserAvatar :name="draftName" :email="draftEmail" :picture="picture" size="lg" />
    <FormField v-slot="{ id }" :label="t('authentication.input.name')">
      <TextInput
        :id="id"
        v-model="draftName"
        autocomplete="name"
        :placeholder="t('authentication.input.namePlaceholder')"
      />
    </FormField>
    <FormField v-slot="{ id }" :label="t('authentication.input.email')">
      <TextInput
        :id="id"
        v-model="draftEmail"
        type="email"
        autocomplete="email"
        required
        :placeholder="t('authentication.input.emailPlaceholder')"
      />
    </FormField>
    <div class="flex gap-2">
      <BaseButton type="submit" variant="primary" :loading="saving">
        {{ t('commons.save') }}
      </BaseButton>
      <BaseButton variant="ghost" @click="editing = false">{{ t('commons.cancel') }}</BaseButton>
    </div>
  </form>
</template>

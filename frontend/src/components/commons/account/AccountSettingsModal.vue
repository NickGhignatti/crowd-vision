<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountSettings } from '@/composables/authentication/useAccountSettings.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'
import ProfileSection from '@/components/commons/account/ProfileSection.vue'
import ChangePasswordModal from '@/components/commons/account/ChangePasswordModal.vue'

const props = defineProps<{ open: boolean }>()

defineEmits<{ close: [] }>()

const { t } = useI18n()
const { fetchProfile, updateProfile } = useAccountSettings()

const profile = ref({ name: '', email: '', picture: '' })
const editing = ref(false)
const saving = ref(false)
const message = ref<{ text: string; error: boolean } | null>(null)
const isPasswordOpen = ref(false)

// Settings are not in the JWT, so every open reads them live.
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    editing.value = false
    message.value = null
    const result = await fetchProfile()
    if (result.ok) {
      profile.value = {
        name: result.name ?? '',
        email: result.email ?? '',
        picture: result.picture ?? '',
      }
    }
  },
  { immediate: true },
)

async function save(name: string, email: string) {
  message.value = null
  saving.value = true
  const result = await updateProfile(email, name)
  saving.value = false

  if (result.ok) {
    profile.value = { ...profile.value, name, email }
    editing.value = false
    message.value = { text: t('authentication.profileUpdated'), error: false }
  } else {
    message.value = { text: t(`authentication.${result.error ?? 'authErrorGeneric'}`), error: true }
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    icon="gear"
    :title="t('authentication.settingsTitle')"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <section class="space-y-3">
        <h3 class="text-label-header uppercase text-on-surface-variant">
          {{ t('authentication.profileSection') }}
        </h3>
        <ProfileSection v-model:editing="editing" v-bind="profile" :saving="saving" @save="save" />
        <FormMessage v-if="message" :tone="message.error ? 'error' : 'success'">
          {{ message.text }}
        </FormMessage>
      </section>

      <section class="space-y-3">
        <h3 class="text-label-header uppercase text-on-surface-variant">
          {{ t('authentication.passwordSection') }}
        </h3>
        <BaseButton icon="lock-key" @click="isPasswordOpen = true">
          {{ t('authentication.changePassword') }}
        </BaseButton>
      </section>
    </div>
  </BaseModal>

  <ChangePasswordModal :open="isPasswordOpen" @close="isPasswordOpen = false" />
</template>

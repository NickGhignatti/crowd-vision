<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useKeycloakAuth } from '@/composables/authentication/useKeycloakAuth.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'
import SocialSignIn from '@/components/commons/account/SocialSignIn.vue'

defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: []; 'switch-to-signup': [] }>()

const { t } = useI18n()
const { beginLogin, loginWithPassword } = useKeycloakAuth()

const username = ref('')
const password = ref('')
const isSubmitting = ref(false)
const errorKey = ref<string | null>(null)

const continueWithGoogle = () => beginLogin(window.location.pathname, 'google')

// The password form posts to claims-gateway; only the Google flow leaves for Keycloak.
async function submit() {
  errorKey.value = null
  isSubmitting.value = true
  const result = await loginWithPassword(username.value, password.value)
  isSubmitting.value = false

  if (result.ok) emit('close')
  else errorKey.value = result.error ?? 'authErrorGeneric'
}
</script>

<template>
  <BaseModal
    :open="open"
    size="sm"
    icon="user-circle"
    :title="t('authentication.welcomeBack')"
    :subtitle="t('authentication.signInToContinue')"
    @close="emit('close')"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <FormField v-slot="{ id }" :label="t('authentication.input.username')">
        <TextInput
          :id="id"
          v-model="username"
          size="lg"
          icon="user"
          autocomplete="username"
          required
          :placeholder="t('authentication.input.usernamePlaceholder')"
        />
      </FormField>
      <FormField v-slot="{ id }" :label="t('authentication.input.password')">
        <TextInput
          :id="id"
          v-model="password"
          type="password"
          size="lg"
          icon="lock-key"
          autocomplete="current-password"
          required
          :placeholder="t('authentication.input.passwordPlaceholder')"
        />
      </FormField>

      <FormMessage v-if="errorKey">{{ t(`authentication.${errorKey}`) }}</FormMessage>

      <BaseButton type="submit" variant="primary" size="lg" block :loading="isSubmitting">
        {{ isSubmitting ? t('authentication.signingIn') : t('authentication.login') }}
      </BaseButton>
    </form>

    <SocialSignIn class="mt-5" @google="continueWithGoogle" />

    <p class="mt-5 text-center text-body-sm text-on-surface-variant">
      {{ t('authentication.noAccount') }}
      <button
        type="button"
        class="font-semibold text-primary hover:underline"
        @click="emit('switch-to-signup')"
      >
        {{ t('authentication.register') }}
      </button>
    </p>
  </BaseModal>
</template>

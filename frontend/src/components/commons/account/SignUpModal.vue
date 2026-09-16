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

const emit = defineEmits<{ close: []; 'switch-to-login': [] }>()

const { t } = useI18n()
const { beginRegister, registerWithPassword } = useKeycloakAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const isSubmitting = ref(false)
const errorKey = ref<string | null>(null)

const continueWithGoogle = () => beginRegister(window.location.pathname, 'google')

// claims-gateway creates the Keycloak user and logs it in within the same request.
async function submit() {
  errorKey.value = null
  isSubmitting.value = true
  const result = await registerWithPassword(email.value, password.value, name.value)
  isSubmitting.value = false

  if (result.ok) emit('close')
  else errorKey.value = result.error ?? 'authErrorGeneric'
}
</script>

<template>
  <BaseModal
    :open="open"
    size="sm"
    icon="user-plus"
    :title="t('authentication.createAnAccount')"
    :subtitle="t('authentication.join')"
    @close="emit('close')"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <FormField v-slot="{ id }" :label="t('authentication.input.name')">
        <TextInput
          :id="id"
          v-model="name"
          size="lg"
          icon="identification-card"
          autocomplete="name"
          :placeholder="t('authentication.input.namePlaceholder')"
        />
      </FormField>
      <FormField v-slot="{ id }" :label="t('authentication.input.email')">
        <TextInput
          :id="id"
          v-model="email"
          type="email"
          size="lg"
          icon="envelope-simple"
          autocomplete="email"
          required
          :placeholder="t('authentication.input.emailPlaceholder')"
        />
      </FormField>
      <FormField v-slot="{ id }" :label="t('authentication.input.password')">
        <TextInput
          :id="id"
          v-model="password"
          type="password"
          size="lg"
          icon="lock-key"
          autocomplete="new-password"
          required
          :placeholder="t('authentication.input.passwordPlaceholder')"
        />
      </FormField>

      <FormMessage v-if="errorKey">{{ t(`authentication.${errorKey}`) }}</FormMessage>

      <BaseButton type="submit" variant="primary" size="lg" block :loading="isSubmitting">
        {{ isSubmitting ? t('authentication.registering') : t('authentication.createAnAccount') }}
      </BaseButton>
    </form>

    <SocialSignIn class="mt-5" @google="continueWithGoogle" />

    <p class="mt-5 text-center text-body-sm text-on-surface-variant">
      {{ t('authentication.alreadyAnAccount') }}
      <button
        type="button"
        class="font-semibold text-primary hover:underline"
        @click="emit('switch-to-login')"
      >
        {{ t('authentication.login') }}
      </button>
    </p>
  </BaseModal>
</template>

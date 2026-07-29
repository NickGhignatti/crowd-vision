<script setup lang="ts">
import { ref, watch } from 'vue'
import StandardModal from '@/components/modals/StandardModal.vue'
import ChangePasswordModal from '@/components/modals/ChangePasswordModal.vue'
import UserAvatar from '@/components/avatars/UserAvatar.vue'

import { useI18n } from 'vue-i18n'
import { useAccountSettings } from '@/composables/auth/useAccountSettings.ts'

const { t } = useI18n()
const { fetchProfile, updateProfile } = useAccountSettings()

const props = defineProps<{
  isOpen: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()

const name = ref('')
const email = ref('')
const picture = ref('')

// Profile fields are read-only until the pencil is clicked — draftName/Email
// hold the in-progress edit so Cancel can discard it without touching the
// displayed values.
const isEditingProfile = ref(false)
const draftName = ref('')
const draftEmail = ref('')
const isProfileSubmitting = ref(false)
const profileMessage = ref<string | null>(null)
const profileMessageIsError = ref(false)

const isPasswordModalOpen = ref(false)

// Prefill on every open — settings data isn't part of the JWT (see
// useAccountSettings.ts), so it's fetched live each time the modal is shown
// rather than cached from a prior session.
watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return
    isEditingProfile.value = false
    profileMessage.value = null
    const result = await fetchProfile()
    if (result.ok) {
      name.value = result.name ?? ''
      email.value = result.email ?? ''
      picture.value = result.picture ?? ''
    }
  },
  { immediate: true },
)

function startEditingProfile() {
  draftName.value = name.value
  draftEmail.value = email.value
  profileMessage.value = null
  isEditingProfile.value = true
}

function cancelEditingProfile() {
  isEditingProfile.value = false
}

async function handleProfileSubmit() {
  profileMessage.value = null
  isProfileSubmitting.value = true
  const result = await updateProfile(draftEmail.value, draftName.value)
  isProfileSubmitting.value = false

  profileMessageIsError.value = !result.ok
  if (result.ok) {
    name.value = draftName.value
    email.value = draftEmail.value
    isEditingProfile.value = false
    profileMessage.value = t('authentication.profileUpdated')
  } else {
    profileMessage.value = t(`authentication.${result.error ?? 'authErrorGeneric'}`)
  }
}

const inputClass =
  'w-full py-3 px-4 bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
const buttonClass =
  'py-2.5 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0'
const secondaryButtonClass =
  'py-2.5 px-5 bg-white hover:bg-slate-50 text-slate-600 font-bold rounded-xl border border-slate-200 transition-colors'
</script>

<template>
  <StandardModal :is-open="isOpen" size="lg" @close="$emit('close')">
    <div class="relative z-10 mb-6">
      <h2 class="text-2xl font-bold text-slate-900 tracking-tight">
        {{ t('authentication.settingsTitle') }}
      </h2>
    </div>

    <div class="relative z-10 space-y-8">
      <section>
        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
          {{ t('authentication.profileSection') }}
        </h3>

        <div v-if="!isEditingProfile" class="flex items-center gap-4">
          <UserAvatar :name="name" :email="email" :picture="picture" size="lg" />
          <div class="flex-1 min-w-0">
            <p class="font-bold text-slate-900 truncate">{{ name || email }}</p>
            <p v-if="name" class="text-sm text-slate-500 truncate">{{ email }}</p>
          </div>
          <button
            type="button"
            :aria-label="t('authentication.editProfile')"
            class="shrink-0 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 p-2.5 rounded-lg transition-colors"
            @click="startEditingProfile"
          >
            <i class="ph-bold ph-pencil-simple text-lg"></i>
          </button>
        </div>

        <form v-else class="profile-form space-y-4" @submit.prevent="handleProfileSubmit">
          <div class="mb-2">
            <UserAvatar :name="draftName" :email="draftEmail" :picture="picture" size="lg" />
          </div>
          <div>
            <label class="sr-only" for="settings-name">{{ t('authentication.input.name') }}</label>
            <input
              id="settings-name"
              v-model="draftName"
              type="text"
              autocomplete="name"
              :placeholder="t('authentication.input.namePlaceholder')"
              :class="inputClass"
            />
          </div>
          <div>
            <label class="sr-only" for="settings-email">{{ t('authentication.input.email') }}</label>
            <input
              id="settings-email"
              v-model="draftEmail"
              type="email"
              autocomplete="email"
              required
              :placeholder="t('authentication.input.emailPlaceholder')"
              :class="inputClass"
            />
          </div>
          <div class="flex gap-3">
            <button type="submit" :disabled="isProfileSubmitting" :class="buttonClass">
              {{ t('commons.save') }}
            </button>
            <button type="button" :class="secondaryButtonClass" @click="cancelEditingProfile">
              {{ t('commons.cancel') }}
            </button>
          </div>
        </form>

        <p
          v-if="profileMessage"
          class="text-sm mt-3"
          :class="profileMessageIsError ? 'text-red-600' : 'text-emerald-600'"
        >
          {{ profileMessage }}
        </p>
      </section>

      <section>
        <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
          {{ t('authentication.passwordSection') }}
        </h3>
        <button
          type="button"
          class="py-2.5 px-5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 transition-colors flex items-center gap-2"
          @click="isPasswordModalOpen = true"
        >
          <i class="ph-bold ph-lock-key text-lg"></i>
          {{ t('authentication.changePassword') }}
        </button>
      </section>
    </div>
  </StandardModal>

  <ChangePasswordModal :is-open="isPasswordModalOpen" @close="isPasswordModalOpen = false" />
</template>

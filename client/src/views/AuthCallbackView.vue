<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useKeycloakAuth } from '@/composables/auth/useKeycloakAuth.ts'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { completeLogin } = useKeycloakAuth()

const failed = ref(false)

onMounted(async () => {
  const code = route.query.code
  const state = route.query.state
  const idpError = route.query.error

  if (idpError || typeof code !== 'string' || typeof state !== 'string') {
    failed.value = true
    return
  }

  const { ok, redirectPath } = await completeLogin(code, state)
  if (!ok) {
    failed.value = true
    return
  }
  await router.replace(redirectPath)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div v-if="failed" class="text-center">
      <p class="text-slate-700 font-semibold">{{ t('authentication.callbackFailed') }}</p>
      <router-link to="/" class="text-emerald-600 hover:underline">{{
        t('authentication.backToHome')
      }}</router-link>
    </div>
    <div v-else class="text-center text-slate-500">
      {{ t('authentication.signingIn') }}
    </div>
  </div>
</template>

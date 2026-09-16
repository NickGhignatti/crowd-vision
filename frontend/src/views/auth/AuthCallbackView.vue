<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useKeycloakAuth } from '@/composables/auth/useKeycloakAuth.ts'
import { ROUTES } from '@/router/routes.ts'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import BrandLogo from '@/components/commons/layout/BrandLogo.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { completeLogin } = useKeycloakAuth()

const failed = ref(false)

onMounted(async () => {
  const { code, state, error } = route.query
  if (error || typeof code !== 'string' || typeof state !== 'string') {
    failed.value = true
    return
  }

  try {
    const { ok, redirectPath } = await completeLogin(code, state)
    if (ok) await router.replace(redirectPath)
    else failed.value = true
  } catch {
    // A network failure in the exchange throws instead of returning ok: false.
    failed.value = true
  }
})
</script>

<template>
  <main class="flex min-h-full flex-col items-center justify-center gap-8 p-6">
    <BrandLogo />
    <div class="surface-card flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
      <template v-if="failed">
        <span
          class="flex size-12 items-center justify-center rounded-xl bg-error-container text-2xl text-on-error-container"
        >
          <BaseIcon name="warning-circle" />
        </span>
        <p class="text-title-sm">{{ t('authentication.callbackFailed') }}</p>
        <BaseButton variant="primary" icon="arrow-left" :to="ROUTES.home">
          {{ t('authentication.backToHome') }}
        </BaseButton>
      </template>
      <template v-else>
        <BaseIcon name="circle-notch" class="animate-spin text-3xl text-primary" />
        <p class="text-body-md text-on-surface-variant" role="status">
          {{ t('authentication.signingIn') }}
        </p>
      </template>
    </div>
  </main>
</template>

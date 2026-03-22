<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import QRCode from 'qrcode'
import { useI18n } from 'vue-i18n'
import { ROLE_META } from '@/helpers/roles.ts'

const { t } = useI18n()

const props = defineProps<{
  domain: string | null
  qrCodes: Record<string, string>
  isLoading: boolean
}>()

const qrDataUrls = ref<Record<string, string>>({})
const selectedRole = ref<string | null>(null)

const roles = computed(() => Object.keys(props.qrCodes))

watch(
  () => props.qrCodes,
  async (codes) => {
    const result: Record<string, string> = {}
    for (const [role, uri] of Object.entries(codes)) {
      result[role] = await QRCode.toDataURL(uri, {
        width: 220,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      })
    }
    qrDataUrls.value = result
    const first = Object.keys(codes)[0]
    if (first) selectedRole.value = first
  },
  { deep: true, immediate: true },
)

watch(
  () => props.domain,
  () => {
    selectedRole.value = null
    qrDataUrls.value = {}
  },
)
</script>

<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col h-[600px]">
    <h2 class="text-sm font-bold text-gray-800 tracking-wider uppercase mb-4">
      {{ t('domains.administration.QRCodeTitle') }}
    </h2>

    <div
      v-if="!domain"
      class="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400"
    >
      <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
        <i class="ph-duotone ph-qr-code text-3xl"></i>
      </div>
      <p class="text-sm font-medium">{{ t('domains.administration.selectDomainToSeeQRCode') }}</p>
    </div>

    <div v-else-if="isLoading" class="flex-1 flex items-center justify-center">
      <div
        class="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"
      />
    </div>

    <div v-else class="flex-1 flex flex-col gap-4 min-h-0">
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="role in roles"
          :key="role"
          @click="selectedRole = role"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150"
          :class="
            selectedRole === role
              ? (ROLE_META[role]?.tab ?? 'text-slate-700 border-slate-400 bg-slate-50')
              : 'text-slate-500 border-slate-200 bg-white hover:bg-slate-50'
          "
        >
          {{ t(ROLE_META[role]?.i18nKey ?? 'domains.roles.standardCustomer') }}
        </button>
      </div>

      <!-- QR display -->
      <div class="flex-1 flex flex-col items-center justify-center gap-4">
        <template v-if="selectedRole">
          <!-- Role badge -->
          <span
            class="text-xs font-semibold px-3 py-1 rounded-full border"
            :class="ROLE_META[selectedRole]?.badge ?? 'bg-gray-100 text-gray-700 border-gray-200'"
          >
            {{ t(ROLE_META[selectedRole]?.i18nKey ?? 'domains.roles.standardCustomer') }}
          </span>

          <!-- QR image -->
          <Transition name="fade" mode="out-in">
            <div :key="selectedRole" class="flex flex-col items-center gap-3">
              <img
                v-if="qrDataUrls[selectedRole]"
                :src="qrDataUrls[selectedRole]"
                alt="QR code"
                class="rounded-xl shadow-sm w-[220px] h-[220px]"
              />
              <div v-else class="w-[220px] h-[220px] rounded-xl bg-slate-100 animate-pulse" />
              <p class="text-xs text-slate-400 text-center">
                {{ t('domains.administration.scanQRCode') }}
              </p>
            </div>
          </Transition>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useI18n } from 'vue-i18n'
import { getRoleMeta } from '@/helpers/roles.ts'
import SurfaceCard from '@/components/commons/base/SurfaceCard.vue'
import SegmentedControl from '@/components/commons/base/SegmentedControl.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'
import RoleBadge from '@/components/domains/badges/RoleBadge.vue'

const props = defineProps<{
  domain: string | null
  codes: Record<string, string>
  loading: boolean
}>()

const QR_SIZE = 220

const { t } = useI18n()
const images = ref<Record<string, string>>({})
const role = ref('')

const roleOptions = computed(() =>
  Object.keys(props.codes)
    .filter((value) => !!props.codes[value])
    .map((value) => ({ value, label: t(getRoleMeta(value).i18nKey) })),
)

// QR modules stay dark on light in both themes: scanners expect that contrast.
watch(
  () => props.codes,
  async (codes) => {
    const entries = await Promise.all(
      Object.entries(codes)
        .filter(([, uri]) => !!uri)
        .map(async ([key, uri]) => [
          key,
          await QRCode.toDataURL(uri, {
            width: QR_SIZE,
            margin: 2,
            color: { dark: '#131b2e', light: '#ffffff' },
          }),
        ]),
    )
    images.value = Object.fromEntries(entries)
    role.value = Object.keys(images.value)[0] ?? ''
  },
  { immediate: true },
)
</script>

<template>
  <SurfaceCard
    icon="qr-code"
    :title="t('domains.administration.QRCodeTitle')"
    :description="domain ?? t('domains.administration.selectDomainToSeeQRCode')"
  >
    <EmptyState
      v-if="!domain"
      icon="qr-code"
      :title="t('domains.administration.selectDomainToSeeQRCode')"
    />

    <div v-else-if="loading" class="flex justify-center py-12">
      <div class="size-[220px] animate-pulse rounded-xl bg-surface-container" />
    </div>

    <EmptyState
      v-else-if="roleOptions.length === 0"
      icon="qr-code"
      :title="t('administration.noInvites')"
    />

    <div v-else class="flex flex-col items-center gap-5">
      <SegmentedControl
        v-model="role"
        size="sm"
        :options="roleOptions"
        :label="t('administration.inviteRole')"
        class="max-w-full overflow-x-auto"
      />
      <Transition mode="out-in" enter-from-class="opacity-0" leave-to-class="opacity-0">
        <figure :key="role" class="flex flex-col items-center gap-3 transition-opacity">
          <img
            v-if="images[role]"
            :src="images[role]"
            :alt="t('administration.qrAlt', { domain })"
            class="size-[220px] rounded-2xl bg-white p-1.5 shadow-soft"
          />
          <div v-else class="size-[220px] animate-pulse rounded-xl bg-surface-container" />
          <figcaption class="flex flex-col items-center gap-2 text-center">
            <RoleBadge :role="role" />
            <span class="text-body-sm text-on-surface-variant">
              {{ t('domains.administration.scanQRCode') }}
            </span>
          </figcaption>
        </figure>
      </Transition>
    </div>
  </SurfaceCard>
</template>

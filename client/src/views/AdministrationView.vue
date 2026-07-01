<script setup lang="ts">
import { onMounted, ref } from 'vue'
import DomainsList from '@/components/lists/DomainsList.vue'
import QrCodeCard from '@/components/cards/QrCodeCard.vue'
import NavBar from '@/components/layouts/NavBar.vue'
import AddDomainModalModal from '@/components/modals/creation/AddDomainModal.vue'
import RegisterBuildingModal from '@/components/modals/creation/RegisterBuildingModal.vue'
import { useI18n } from 'vue-i18n'
import type { DomainToAddWithVisibilityPayload, UnifiedDomainGroup } from '@/interfaces/domain.ts'
import { useAuthStore } from '@/stores/authentication.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { useDomainsStore, useSubdomainsStore } from '@/stores/domain.ts'
import { useNotificationStore } from '@/stores/notification.ts'
import { canManageDomain } from '@/helpers/roles.ts'

const selectedDomain = ref<string | null>(null)
const domains = ref<string[]>([])
const unifiedDomains = ref<UnifiedDomainGroup[]>([])
const isSubmitting = ref(false)
const isAddDomainModalOpen = ref(false)
const isRegisterModalOpen = ref(false)
const targetUploadDomain = ref<string | null>(null)
const qrCodes = ref<Record<string, string>>({})
const isLoadingQr = ref(false)

const { t } = useI18n()
const authStore = useAuthStore()
const domainsStore = useDomainsStore()
const buildingsStore = useBuildingsStore()
const subdomainsStore = useSubdomainsStore()
const notificationStore = useNotificationStore()

const handleAddDomain = async (payload: DomainToAddWithVisibilityPayload) => {
  isSubmitting.value = true

  try {
    await domainsStore.createNewDomain(payload)
    const isSub = !!payload.masterDomain?.trim()
    if (isSub) subdomainsStore.invalidate()
    else domainsStore.invalidate()
    await getAllSubdomains()
    isAddDomainModalOpen.value = false
  } catch (error) {
    console.error(error)
  } finally {
    isSubmitting.value = false
  }
}

const handleSelectDomain = async (domainName: string) => {
  selectedDomain.value = domainName
  isLoadingQr.value = true
  try {
    qrCodes.value = await domainsStore.getDomainQRs(domainName)
  } catch (e) {
    console.error(e)
  } finally {
    isLoadingQr.value = false
  }
}

const triggerUpload = (domainName: string) => {
  targetUploadDomain.value = domainName
  isRegisterModalOpen.value = true
}

const getAllSubdomains = async () => {
  await domainsStore.fetchMemberships()
  // The administration panel is for managing domains, so only surface the ones
  // where the user holds a role that can actually act on them (not standard_customer).
  const memberships = (domainsStore.memberships ?? []).filter((m: any) => canManageDomain(m.role))

  await subdomainsStore.fetch(memberships)

  domains.value = memberships.map((m: any) => m.domainName)

  const groups: Record<string, UnifiedDomainGroup> = {}
  memberships.forEach((m: any) => {
    groups[m.domainName] = {
      name: m.domainName,
      role: m.role,
      canUpload: canManageDomain(m.role),
      subdomains: [],
    }
  })

  memberships.forEach((m: any) => {
    const subs = subdomainsStore.byDomain[m.domainName] ?? []
    subs.forEach((subdomain: any) => {
      groups[m.domainName]?.subdomains.push({
        name: subdomain,
        displayName: subdomain.replace('.' + m.domainName, ''),
      })
    })
  })

  const allDomainNames = Object.keys(groups)
  unifiedDomains.value = Object.values(groups)
    .filter(
      (g) => !allDomainNames.some((other) => other !== g.name && g.name.endsWith(`.${other}`)),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

const handleNotificationSubscription = async (domainName: string) => {
  await notificationStore.handleNotificationSubscription(authStore.accountName || '', domainName)
}

onMounted(async () => {
  await getAllSubdomains()
  await notificationStore.fetchAccountNotificationPreference(authStore.accountName || '')
})
</script>

<template>
  <NavBar></NavBar>
  <div class="min-h-screen bg-gray-50 p-6 md:p-10 flex justify-center items-start font-sans">
    <div class="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
      <DomainsList
        :domains="unifiedDomains"
        @add-domain="isAddDomainModalOpen = true"
        @select-domain="handleSelectDomain"
        @upload="triggerUpload"
        @notification-trigger="handleNotificationSubscription"
      />

      <QrCodeCard :domain="selectedDomain" :qr-codes="qrCodes" :is-loading="isLoadingQr" />
    </div>

    <AddDomainModalModal
      :is-open="isAddDomainModalOpen"
      :is-submitting="isSubmitting"
      :master-domain-choices="domains"
      @close="isAddDomainModalOpen = false"
      @add="handleAddDomain"
    />

    <RegisterBuildingModal
      :is-open="isRegisterModalOpen"
      :domain-name="targetUploadDomain ?? ''"
      @close="isRegisterModalOpen = false; targetUploadDomain = null"
    />
  </div>
</template>

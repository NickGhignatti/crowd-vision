<script setup lang="ts">
import { onMounted, ref } from 'vue'
import DomainList from '@/components/menus/DomainList.vue'
import QR from '@/components/cards/QR.vue'
import NavBar from '@/components/NavBar.vue'
import AddDomainModal from '@/components/modals/AddDomain.vue'
import { authenticatedFetch } from '@/composables/useApi.ts'
import type { DomainMembership } from '@/models/domain.ts'
import { useI18n } from 'vue-i18n'
import type { DomainToAddWithVisibilityPayload, UnifiedDomainGroup } from '@/interfaces/domain.ts'

const selectedDomain = ref<string | null>(null)
const domains = ref<string[]>([])
const unifiedDomains = ref<UnifiedDomainGroup[]>([])
const isSubmitting = ref(false)
const isAddDomainModalOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const targetUploadDomain = ref<string | null>(null)
const qrCodes = ref<Record<string, string>>({})
const isLoadingQr = ref(false)

const { t } = useI18n()

const handleAddDomain = async (payload: DomainToAddWithVisibilityPayload) => {
  isSubmitting.value = true
  const accountName = localStorage.getItem('account-name')

  try {
    if (!accountName) {
      throw new Error('Missing account name in local storage')
    }

    const masterDomain = payload.masterDomain?.trim().toLowerCase()
    const endpoint = masterDomain
      ? `/auth/subdomains/${encodeURIComponent(masterDomain)}`
      : '/auth/domains'

    const normalizedName = payload.name.trim().toLowerCase()
    const domainName =
      masterDomain && !normalizedName.endsWith(`.${masterDomain}`)
        ? `${normalizedName}.${masterDomain}`
        : normalizedName

    const body = {
      ...payload,
      name: domainName,
      creatorUsername: accountName,
    }

    delete body.masterDomain

    const response = await authenticatedFetch(endpoint, 'POST', {
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Failed to create domain')
    }

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
    const accountName = localStorage.getItem('account-name')
    const response = await authenticatedFetch(`/auth/domains/${domainName}/totp/qr/${accountName}`)
    if (!response.ok) throw new Error('Failed to fetch QR codes')
    const data = await response.json()
    qrCodes.value = data.qrCodes
  } catch (e) {
    console.error(e)
  } finally {
    isLoadingQr.value = false
  }
}

const triggerUpload = (domainName: string) => {
  targetUploadDomain.value = domainName
  fileInput.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files?.length) return

  const file = target.files[0]
  if (!file || (file.type !== 'application/json' && !file.name.endsWith('.json'))) {
    alert(t('model.controls.invalidJsonUpload'))
    return
  }

  try {
    isUploading.value = true
    const payload = JSON.parse(await file.text())

    if (targetUploadDomain.value) {
      payload.domains = [targetUploadDomain.value]
    }

    const response = await authenticatedFetch(`/twin/register`, 'POST', {
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error('Failed to register twin model')
    }
  } catch (e) {
    console.error('Upload failed', e)
    alert(t('model.controls.uploadFailed'))
  } finally {
    isUploading.value = false
    if (fileInput.value) fileInput.value.value = ''
    targetUploadDomain.value = null
  }
}

const getAllSubdomains = async () => {
  domains.value = []
  unifiedDomains.value = []

  const accountName = localStorage.getItem('account-name')
  if (!accountName) return

  const mainDomainsResponse = await authenticatedFetch(`/auth/domains/${accountName}`)
  const mainDomains = await mainDomainsResponse.json()
  const memberships: DomainMembership[] = mainDomains.domains ?? []

  domains.value = memberships.map((domain) => domain.domainName)

  const groups: Record<string, UnifiedDomainGroup> = {}

  memberships.forEach((m) => {
    groups[m.domainName] = {
      name: m.domainName,
      role: m.role,
      canUpload: ['admin', 'business_admin', 'business_staff'].includes(m.role),
      subdomains: [],
    }
  })

  await Promise.allSettled(
    memberships.map(async (domain) => {
      const response = await authenticatedFetch(`/auth/subdomains/${domain.domainName}`)
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to fetch subdomains')
      }

      const data = await response.json()
      if (data.length > 0) {
        data.forEach((subdomain: string) => {
          if (groups[domain.domainName]) {
            groups[domain.domainName]?.subdomains.push({
              name: subdomain,
              displayName: subdomain.replace('.' + domain.domainName, ''),
            })
          }
        })
      }
    }),
  ).then((results) => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const failedDomain = memberships[index]?.domainName ?? '(unknown domain)'
        console.error(`Error fetching subdomains for domain ${failedDomain}:`, result.reason)
      }
    })
  })

  const allDomainNames = Object.keys(groups)

  unifiedDomains.value = Object.values(groups)
    .filter(
      (group) =>
        !allDomainNames.some((other) => other !== group.name && group.name.endsWith(`.${other}`)),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

onMounted(async () => {
  await getAllSubdomains()
})
</script>

<template>
  <NavBar></NavBar>
  <div class="min-h-screen bg-gray-50 p-6 md:p-10 flex justify-center items-start font-sans">
    <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleFileUpload" />

    <div class="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
      <DomainList
        :domains="unifiedDomains"
        :is-uploading="isUploading"
        @add-domain="isAddDomainModalOpen = true"
        @select-domain="handleSelectDomain"
        @upload="triggerUpload"
      />

      <QR :domain="selectedDomain" :qr-codes="qrCodes" :is-loading="isLoadingQr" />
    </div>

    <AddDomainModal
      :is-open="isAddDomainModalOpen"
      :is-submitting="isSubmitting"
      :master-domain-choices="domains"
      @close="isAddDomainModalOpen = false"
      @add="handleAddDomain"
    />
  </div>
</template>

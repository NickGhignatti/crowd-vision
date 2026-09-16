<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DomainToAddWithVisibilityPayload } from '@/interfaces/domain.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import { useManagedDomains } from '@/composables/domains/useManagedDomains.ts'
import AppLayout from '@/components/commons/layout/AppLayout.vue'
import PageHeader from '@/components/commons/layout/PageHeader.vue'
import ManagedDomainsCard from '@/components/administration/domains/ManagedDomainsCard.vue'
import InviteQrCard from '@/components/administration/invites/InviteQrCard.vue'
import RegisterBuildingModal from '@/components/administration/registration/RegisterBuildingModal.vue'
import CreateDomainModal from '@/components/domains/modals/CreateDomainModal.vue'

const { t } = useI18n()
const domainsStore = useDomainsStore()
const { groups, isLoading, refresh, invalidate } = useManagedDomains()

const selectedDomain = ref<string | null>(null)
const qrCodes = ref<Record<string, string>>({})
const isLoadingQr = ref(false)
const isCreating = ref(false)
const isCreateOpen = ref(false)
const uploadTarget = ref<string | null>(null)

const parentChoices = computed(() => groups.value.map((group) => group.name))

const selectDomain = async (domain: string) => {
  selectedDomain.value = domain
  isLoadingQr.value = true
  try {
    qrCodes.value = await domainsStore.getDomainQRs(domain)
  } catch (error) {
    console.error(error)
    qrCodes.value = {}
  } finally {
    isLoadingQr.value = false
  }
}

const create = async (payload: DomainToAddWithVisibilityPayload) => {
  isCreating.value = true
  try {
    await domainsStore.createNewDomain(payload)
    invalidate(!!payload.masterDomain)
    await refresh()
    isCreateOpen.value = false
  } catch (error) {
    console.error(error)
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <AppLayout>
    <PageHeader
      icon="shield-check"
      :title="t('commons.adminPanel')"
      :subtitle="t('administration.subtitle')"
    />

    <div class="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ManagedDomainsCard
        :groups="groups"
        :loading="isLoading"
        :selected="selectedDomain"
        @select="selectDomain"
        @upload="uploadTarget = $event"
        @create="isCreateOpen = true"
      />
      <InviteQrCard
        class="xl:sticky xl:top-24"
        :domain="selectedDomain"
        :codes="qrCodes"
        :loading="isLoadingQr"
      />
    </div>

    <CreateDomainModal
      :open="isCreateOpen"
      :submitting="isCreating"
      :parent-choices="parentChoices"
      @close="isCreateOpen = false"
      @create="create"
    />
    <RegisterBuildingModal
      :open="!!uploadTarget"
      :domain-name="uploadTarget ?? ''"
      @close="uploadTarget = null"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DomainToAddWithVisibilityPayload } from '@/interfaces/domain.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import AppLayout from '@/components/commons/layout/AppLayout.vue'
import PageHeader from '@/components/commons/layout/PageHeader.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import SearchInput from '@/components/commons/forms/SearchInput.vue'
import DomainsTable from '@/components/domains/table/DomainsTable.vue'
import CreateDomainModal from '@/components/domains/modals/CreateDomainModal.vue'
import JoinWithCodeModal from '@/components/domains/modals/JoinWithCodeModal.vue'

const { t } = useI18n()
const domainsStore = useDomainsStore()

const query = ref('')
const isLoading = ref(true)
const isSubmitting = ref(false)
const dialog = ref<'create' | 'join' | null>(null)

const rows = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return domainsStore.unifiedDomains.filter((row) => row.name.toLowerCase().includes(needle))
})

// Counts are scoped to the resolved rows, so they load after domains and memberships.
const load = async (force = false) => {
  isLoading.value = true
  try {
    await Promise.all([domainsStore.fetchAll(force), domainsStore.fetchMemberships(force)])
    await Promise.all([
      domainsStore.fetchMemberCounts(),
      domainsStore.fetchBuildingCounts(domainsStore.unifiedDomains.map((row) => row.name)),
    ])
  } finally {
    isLoading.value = false
  }
}

const create = async (payload: DomainToAddWithVisibilityPayload) => {
  isSubmitting.value = true
  try {
    await domainsStore.createNewDomain(payload)
    await load(true)
    dialog.value = null
  } catch (error) {
    console.error(error)
  } finally {
    isSubmitting.value = false
  }
}

const joined = async () => {
  dialog.value = null
  await load(true)
}

onMounted(() => load())
</script>

<template>
  <AppLayout>
    <PageHeader
      icon="globe-hemisphere-west"
      :title="t('domains.table.title')"
      :subtitle="t('domains.subtitle')"
    >
      <SearchInput
        v-model="query"
        class="w-full sm:w-64"
        :placeholder="t('domains.inputs.search')"
      />
      <BaseButton icon="lock-key" @click="dialog = 'join'">
        {{ t('domains.inputs.private') }}
      </BaseButton>
      <BaseButton variant="primary" icon="plus" @click="dialog = 'create'">
        {{ t('domains.inputs.create') }}
      </BaseButton>
    </PageHeader>

    <section class="surface-card overflow-hidden">
      <DomainsTable :rows="rows" :loading="isLoading" @changed="load(true)" />
    </section>

    <CreateDomainModal
      :open="dialog === 'create'"
      :submitting="isSubmitting"
      @close="dialog = null"
      @create="create"
    />
    <JoinWithCodeModal :open="dialog === 'join'" @close="dialog = null" @joined="joined" />
  </AppLayout>
</template>

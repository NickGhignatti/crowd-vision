<script setup lang="ts">
import NavBar from '@/components/layouts/NavBar.vue'
import AddDomainModalModal from '@/components/modals/creation/AddDomainModal.vue'
import JoinWithCodeModal from '@/components/modals/creation/JoinWithCodeModal.vue'
import DomainsTable from '@/components/tables/DomainsTable.vue'

import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DomainToAddWithVisibilityPayload } from '@/interfaces/domain.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import LongSearchInput from '@/components/inputs/search/LongSearchInput.vue'

const { t } = useI18n()
const domainsStore = useDomainsStore()

const searchQuery = ref('')
const isSubmitting = ref(false)
const isAddDomainModalOpen = ref(false)
const isJoinWithCodeModalOpen = ref(false)
const rows = computed(() => domainsStore.unifiedDomains)

// Loads domains, memberships, then the counts scoped to the resolved row set.
const loadDomains = async (force = false) => {
  await Promise.all([domainsStore.fetchAll(force), domainsStore.fetchMemberships(force)])
  await Promise.all([
    domainsStore.fetchMemberCounts(),
    domainsStore.fetchBuildingCounts(rows.value.map((r) => r.name)),
  ])
}

const handleCreateDomain = async (payload: DomainToAddWithVisibilityPayload) => {
  isSubmitting.value = true

  try {
    await domainsStore.createNewDomain(payload)
    await loadDomains(true)
    isAddDomainModalOpen.value = false
  } catch (error) {
    console.error(error)
  } finally {
    isSubmitting.value = false
  }
}

const filteredDomains = computed(() => {
  if (!searchQuery.value) return rows.value
  const query = searchQuery.value.toLowerCase()
  return rows.value.filter((d) => d.name.toLowerCase().includes(query))
})

const handleJoinedWithCode = async () => {
  isJoinWithCodeModalOpen.value = false
  await loadDomains(true)
}

onMounted(() => {
  loadDomains()
})
</script>

<template>
  <NavBar></NavBar>
  <div class="flex flex-col h-full p-6 gap-6 bg-slate-50/50">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <h1
        class="text-2xl font-bold text-slate-900 dark:text-dark ml-1 shrink-0 flex items-center gap-3"
      >
        <i class="ph-duotone ph-globe text-emerald-600"></i>
        {{ t('domains.table.title') }}
      </h1>

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <LongSearchInput v-model="searchQuery" :placeholder="t('domains.inputs.search')" />

        <div class="h-6 w-px bg-slate-300 hidden sm:block mx-1"></div>

        <button
          @click="isJoinWithCodeModalOpen = true"
          class="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 hover:text-emerald-600 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors shadow-sm"
        >
          <i class="ph-bold ph-lock-key text-lg"></i>
          <span>{{ t('domains.inputs.private') }}</span>
        </button>

        <button
          @click="isAddDomainModalOpen = true"
          class="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors shadow-sm shadow-emerald-600/20"
        >
          <i class="ph-bold ph-plus text-lg"></i>
          <span>{{ t('domains.inputs.create') }}</span>
        </button>
      </div>
    </div>

    <div
      class="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col"
    >
      <DomainsTable
        :rows="filteredDomains"
        @refresh="
          () => {
            loadDomains(true)
          }
        "
      />
    </div>

    <AddDomainModalModal
      :is-open="isAddDomainModalOpen"
      :is-submitting="isSubmitting"
      @close="isAddDomainModalOpen = false"
      @add="handleCreateDomain"
    />

    <JoinWithCodeModal
      :is-open="isJoinWithCodeModalOpen"
      @close="isJoinWithCodeModalOpen = false"
      @joined="handleJoinedWithCode"
    />
  </div>
</template>

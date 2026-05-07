<script setup lang="ts">
import Navbar from '@/components/layouts/Navbar.vue'
import AddDomainModalModal from '@/components/modals/creation/AddDomainModal.vue'
import DomainsTable from '@/components/tables/DomainsTable.vue'
import type { Domain } from '@/models/domain'

import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DomainToAddWithMaster } from '@/interfaces/domain.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import LongSearchInput from '@/components/inputs/search/LongSearchInput.vue'

const { t } = useI18n()
const domainsStore = useDomainsStore()

const searchQuery = ref('')
const isSubmitting = ref(false)
const isAddDomainModalOpen = ref(false)
const domains = computed<Domain[]>(() => domainsStore.allDomains ?? [])
const userMemberships = computed(() => domainsStore.memberships ?? [])

const fetchAllDomains = async () => {
  await domainsStore.fetchAll()
}

const handleCreateDomain = async (payload: DomainToAddWithMaster) => {
  isSubmitting.value = true

  try {
    await domainsStore.createNewDomain(payload)
    await Promise.all([domainsStore.fetchAll(true), domainsStore.fetchMemberships(true)])
    isAddDomainModalOpen.value = false
  } catch (error) {
    console.error(error)
  } finally {
    isSubmitting.value = false
  }
}

const filteredDomains = computed(() => {
  if (!searchQuery.value) return domains.value
  const query = searchQuery.value.toLowerCase()
  return domains.value.filter((d) => d.name.toLowerCase().includes(query))
})

const handlePrivateDomain = () => {
  console.log('Open Private DomainInput Modal - To Be Implemented')
}

onMounted(() => {
  Promise.all([fetchAllDomains(), domainsStore.fetchMemberships()])
})
</script>

<template>
  <Navbar></Navbar>
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
          @click="handlePrivateDomain"
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
        :domains="filteredDomains"
        :user-memberships="userMemberships"
        @refresh="
          () => {
            fetchAllDomains()
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
  </div>
</template>

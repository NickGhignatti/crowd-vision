<script setup lang="ts">
import DomainRecord from '@/components/records/DomainRecord.vue'
import type { DomainRow } from '@/interfaces/domain'

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDomainsStore } from '@/stores/domain.ts'

const { t } = useI18n()

// Inline feedback for a blocked leave — the app has no toast system, and a
// silently-failing button is confusing. Cleared on the next action.
const actionError = ref<string | null>(null)

const props = defineProps<{
  rows: DomainRow[]
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const headers = [
  { key: 'name', label: 'domains.table.headers.name' },
  { key: 'members', label: 'domains.table.headers.members' },
  { key: 'buildings', label: 'domains.table.headers.buildings' },
  { key: 'role', label: 'domains.table.headers.role' },
  { key: 'actions', label: 'domains.table.headers.action' },
]

const domainsStore = useDomainsStore()

const handleSubscribe = async (index: number) => {
  const domain = props.rows[index]
  if (!domain || domain.isPrivate) return

  try {
    await domainsStore.subscribeToDomain(domain)
    emit('refresh')
  } catch (error) {
    console.error(error)
  }
}

const handleUnsubscribe = async (index: number) => {
  const domain = props.rows[index]
  if (!domain || domain.isPrivate) return

  actionError.value = null
  try {
    await domainsStore.unsubscribeFromDomain(domain.name)
    emit('refresh')
  } catch (error) {
    if ((error as { code?: string })?.code === 'LAST_ADMIN') {
      actionError.value = t('domains.errors.lastAdmin')
    }
    console.error(error)
  }
}
</script>

<template>
  <div class="h-full overflow-auto relative custom-scrollbar">
    <div
      v-if="actionError"
      class="sticky top-0 z-20 m-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
    >
      <i class="ph-bold ph-warning-circle text-lg"></i>
      <span class="flex-1">{{ actionError }}</span>
      <button class="text-amber-600 hover:text-amber-800" @click="actionError = null">
        <i class="ph-bold ph-x"></i>
      </button>
    </div>
    <table class="w-full text-left border-collapse">
      <thead class="sticky top-0 z-10 bg-emerald-600 text-white shadow-md">
        <tr>
          <th v-for="header in headers" :key="header.key"
            class="p-4 font-semibold text-sm uppercase tracking-wide border-r border-emerald-500 last:border-r-0 whitespace-nowrap"
            :class="{
              'w-full': header.key === 'name',
              'text-center': header.key !== 'name',
            }">
            {{ t(header.label) }}
          </th>
        </tr>
      </thead>

      <tbody class="divide-y divide-slate-100 bg-white">
        <tr v-for="(item, index) in rows" :key="item.name"
          class="group hover:bg-slate-50 transition-colors duration-150">
          <DomainRecord :id="index" :name="item.name" :isSubscribed="item.isSubscribed"
            :isPrivate="item.isPrivate" :role="item.role" :memberCount="item.memberCount"
            :buildingCount="item.buildingCount" @subscribe="handleSubscribe" @unsubscribe="handleUnsubscribe" />
        </tr>

        <tr v-if="rows.length === 0">
          <td :colspan="headers.length" class="p-8 text-center text-slate-500">
            <div class="flex flex-col items-center gap-2">
              <i class="ph-duotone ph-magnifying-glass text-3xl opacity-50"></i>
              <span>{{ t('domains.inputs.notFound') }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  /* slate-300 */
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #94a3b8;
  /* slate-400 */
}
</style>

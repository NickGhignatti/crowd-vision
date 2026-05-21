<script setup lang="ts">
import DomainRecord from '@/components/records/DomainRecord.vue'
import type { Domain, DomainMembership } from '@/models/domain'

import { useI18n } from 'vue-i18n'
import { ref, watch } from 'vue'
import { useDomainsStore } from '@/stores/domain.ts'

const { t } = useI18n()

const props = defineProps<{
  domains: Domain[]
  userMemberships: DomainMembership[]
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const headers = [
  { key: 'name', label: 'domains.table.headers.name' },
  { key: 'actions', label: 'domains.table.headers.action' },
]

const subscribedSet = ref(new Set<string>())
const domainsStore = useDomainsStore()

watch(
  () => props.userMemberships,
  (newMemberships) => {
    if (newMemberships) {
      subscribedSet.value = new Set(newMemberships.map((m) => m.domainName))
    }
  },
  { immediate: true, deep: true },
)

const handleSubscribe = async (index: number) => {
  const domain = props.domains[index]
  if (!domain) return

  // Optimistic UI Update
  if (domain.authStrategy === 'internal') {
    subscribedSet.value.add(domain.name)
  }

  try {
    await domainsStore.subscribeToDomain(domain)
    if (domain.authStrategy !== 'oidc') {
      emit('refresh')
    }
  } catch (error) {
    // Revert on error
    if (domain.authStrategy === 'internal') {
      subscribedSet.value.delete(domain.name)
    }
    console.error(error)
  }
}

const handleUnsubscribe = async (index: number) => {
  const domain = props.domains[index]
  if (!domain) return

  // Optimistic UI Update
  subscribedSet.value.delete(domain.name)

  try {
    await domainsStore.unsubscribeFromDomain(domain.name)
    emit('refresh')
  } catch (error) {
    subscribedSet.value.add(domain.name)
    console.error(error)
  }
}
const hasSub = (domainName: string): boolean => {
  return subscribedSet.value.has(domainName)
}
</script>

<template>
  <div class="h-full overflow-auto relative custom-scrollbar">
    <table class="w-full text-left border-collapse">
      <thead class="sticky top-0 z-10 bg-emerald-600 text-white shadow-md">
        <tr>
          <th v-for="header in headers" :key="header.key"
            class="p-4 font-semibold text-sm uppercase tracking-wide border-r border-emerald-500 last:border-r-0 whitespace-nowrap"
            :class="{
              'w-full': header.key === 'name',
              'w-1/12 text-center': header.key === 'actions',
            }">
            {{ t(header.label) }}
          </th>
        </tr>
      </thead>

      <tbody class="divide-y divide-slate-100 bg-white">
        <tr v-for="(item, index) in domains" :key="index"
          class="group hover:bg-slate-50 transition-colors duration-150">
          <DomainRecord :id="index" :name="item.name" :isSubscribed="hasSub(item.name)" @subscribe="handleSubscribe"
            @unsubscribe="handleUnsubscribe" />
        </tr>

        <tr v-if="domains.length === 0">
          <td colspan="2" class="p-8 text-center text-slate-500">
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

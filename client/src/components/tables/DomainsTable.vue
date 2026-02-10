<script setup lang="ts">
import DomainRow from '@/components/tables/components/DomainRow.vue'
import type { DomainPayload, DomainMembership } from '@/models/domain'

import { useI18n } from 'vue-i18n'
import { ref, watch } from 'vue'

const { t } = useI18n()

// Props: Items are all available domains. userMemberships is the user's current status.
const props = defineProps<{
  items: DomainPayload[]
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

// Watch for changes in memberships to update the local Set
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
  const domain = props.items[index]
  if (!domain) return

  const username = localStorage.getItem('username')
  if (!username) return

  try {
    // STRATEGY A: External SSO (OIDC)
    if (domain.authStrategy === 'oidc') {
      const res = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/auth/sso/login/${domain.name}?username=${username}`,
      )

      if (!res.ok) throw new Error('Failed to initiate SSO')

      const data = await res.json()

      // Redirect the user away to the Identity Provider (e.g., Unibo, Google)
      // They will come back to the app via the backend callback
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
      }
      return
    }

    // STRATEGY B: Internal (Crowd Vision Managed)
    subscribedSet.value.add(domain.name)

    const response = await fetch(
      `${import.meta.env.VITE_SERVER_URL}/auth/domains/${username}/subscribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName: domain.name }),
      },
    )

    if (!response.ok) throw new Error(`Failed to subscribe to ${domain.name}`)

    emit('refresh')
  } catch (error) {
    if (domain.authStrategy === 'internal') {
      subscribedSet.value.delete(domain.name)
    }
    console.error(error)
  }
}

const handleUnsubscribe = async (index: number) => {
  const domain = props.items[index]
  if (!domain) return

  const username = localStorage.getItem('username')

  try {
    subscribedSet.value.delete(domain.name)

    const response = await fetch(
      `${import.meta.env.VITE_SERVER_URL}/auth/domains/${username}/unsubscribe`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName: domain.name }),
      },
    )

    if (!response.ok) throw new Error(`Failed to unsubscribe from ${domain.name}`)

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
          <th
            v-for="header in headers"
            :key="header.key"
            class="p-4 font-semibold text-sm uppercase tracking-wide border-r border-emerald-500 last:border-r-0 whitespace-nowrap"
            :class="{
              'w-full': header.key === 'name',
              'w-1/12 text-center': header.key === 'actions',
            }"
          >
            {{ t(header.label) }}
          </th>
        </tr>
      </thead>

      <tbody class="divide-y divide-slate-100 bg-white">
        <tr
          v-for="(item, index) in items"
          :key="index"
          class="group hover:bg-slate-50 transition-colors duration-150"
        >
          <DomainRow
            :id="index"
            :name="item.name"
            :isSubscribed="hasSub(item.name)"
            @subscribe="handleSubscribe"
            @unsubscribe="handleUnsubscribe"
          />
        </tr>

        <tr v-if="items.length === 0">
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
  background-color: #cbd5e1; /* slate-300 */
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #94a3b8; /* slate-400 */
}
</style>

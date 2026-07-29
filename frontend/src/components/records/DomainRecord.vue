<script setup lang="ts">
import type { DomainSubscriptionRowProps } from '@/interfaces/domain.ts'
import { getRoleMeta } from '@/helpers/roles.ts'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps<DomainSubscriptionRowProps>()

defineEmits<{
  (e: 'subscribe', id: number): void
  (e: 'unsubscribe', id: number): void
}>()

const roleMeta = computed(() => (props.role ? getRoleMeta(props.role) : null))
</script>

<template>
  <td
    class="p-4 border-r border-slate-100 last:border-r-0 text-slate-700 font-medium group-hover:text-slate-900"
  >
    <div class="flex items-center gap-2">
      <span>{{ name }}</span>
      <span
        v-if="props.isPrivate"
        class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
      >
        <i class="ph-bold ph-lock-key"></i>
        {{ t('domains.labels.private') }}
      </span>
    </div>
  </td>

  <td class="p-4 border-r border-slate-100 last:border-r-0 text-center text-slate-600">
    <span class="inline-flex items-center justify-center gap-1.5">
      <i class="ph-bold ph-users text-slate-400"></i>
      {{ props.memberCount ?? '—' }}
    </span>
  </td>

  <td class="p-4 border-r border-slate-100 last:border-r-0 text-center text-slate-600">
    <span class="inline-flex items-center justify-center gap-1.5">
      <i class="ph-bold ph-buildings text-slate-400"></i>
      {{ props.buildingCount ?? '—' }}
    </span>
  </td>

  <td class="p-4 border-r border-slate-100 last:border-r-0 text-center">
    <span
      v-if="roleMeta"
      class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      :class="roleMeta.badge"
    >
      {{ t(roleMeta.i18nKey) }}
    </span>
    <span v-else class="text-xs italic text-slate-400">
      {{ t('domains.labels.notMember') }}
    </span>
  </td>

  <td class="p-2 border-r border-slate-100 last:border-r-0">
    <div class="flex items-center justify-center">
      <span
        v-if="props.isPrivate"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400"
        :title="t('domains.labels.memberLabel')"
      >
        <i class="ph-bold ph-lock-key text-lg"></i>
      </span>

      <button
        v-else-if="!props.isSubscribed"
        @click="$emit('subscribe', id)"
        class="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-emerald-600 transition-all hover:bg-emerald-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        <i class="ph-bold ph-user-plus text-xl"></i>
      </button>

      <button
        v-else
        @click="$emit('unsubscribe', id)"
        class="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 transition-all hover:bg-red-600 hover:border-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        <i class="ph-bold ph-user-minus text-xl"></i>
      </button>
    </div>
  </td>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { DomainRow } from '@/interfaces/domain.ts'
import BaseBadge from '@/components/commons/base/BaseBadge.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import RoleBadge from '@/components/domains/badges/RoleBadge.vue'
import MembershipAction from '@/components/domains/table/MembershipAction.vue'

defineProps<{ row: DomainRow; busy: boolean }>()

defineEmits<{ join: []; leave: [] }>()

const { t } = useI18n()
const EMPTY = '—'
</script>

<template>
  <tr
    class="h-14 transition-colors even:bg-surface-container-low hover:bg-surface-container [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl"
  >
    <td class="px-4 py-2.5">
      <div class="flex items-center gap-2.5">
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant"
        >
          <BaseIcon :name="row.isPrivate ? 'lock-key' : 'globe-hemisphere-west'" />
        </span>
        <span class="text-mono-metric text-on-surface">{{ row.name }}</span>
        <BaseBadge v-if="row.isPrivate" size="sm">{{ t('domains.labels.private') }}</BaseBadge>
      </div>
    </td>
    <td class="px-4 py-2.5 text-center tabular-nums">
      <span class="inline-flex items-center gap-1.5">
        <BaseIcon name="users" class="text-on-surface-variant" />
        {{ row.memberCount ?? EMPTY }}
      </span>
    </td>
    <td class="px-4 py-2.5 text-center tabular-nums">
      <span class="inline-flex items-center gap-1.5">
        <BaseIcon name="buildings" class="text-on-surface-variant" />
        {{ row.buildingCount ?? EMPTY }}
      </span>
    </td>
    <td class="px-4 py-2.5 text-center">
      <RoleBadge v-if="row.role" :role="row.role" />
      <span v-else class="text-label-stat text-on-surface-variant">
        {{ t('domains.labels.notMember') }}
      </span>
    </td>
    <td class="px-4 py-2.5 text-right">
      <MembershipAction
        :is-private="row.isPrivate"
        :is-member="row.isSubscribed"
        :busy="busy"
        @join="$emit('join')"
        @leave="$emit('leave')"
      />
    </td>
  </tr>
</template>

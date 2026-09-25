<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { UnifiedDomainGroup } from '@/types/domains/domain.ts'
import SurfaceCard from '@/components/commons/base/SurfaceCard.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'
import ManagedDomainItem from '@/components/administration/domains/ManagedDomainItem.vue'

defineProps<{ groups: UnifiedDomainGroup[]; loading: boolean; selected: string | null }>()

defineEmits<{ select: [domain: string]; upload: [domain: string]; create: [] }>()

const { t } = useI18n()
</script>

<template>
  <SurfaceCard
    icon="tree-structure"
    :title="t('domains.administration.organizationDomains')"
    :description="t('administration.domainsHint')"
  >
    <template #actions>
      <BaseButton size="sm" variant="primary" icon="plus" @click="$emit('create')">
        {{ t('domains.administration.addNewDomain') }}
      </BaseButton>
    </template>

    <div class="space-y-2.5">
      <template v-if="loading && groups.length === 0">
        <div v-for="n in 3" :key="n" class="h-16 animate-pulse rounded-xl bg-surface-container" />
      </template>
      <EmptyState
        v-else-if="groups.length === 0"
        icon="tree-structure"
        :title="t('administration.noDomains')"
        :description="t('administration.noDomainsHint')"
      />
      <template v-else>
        <ManagedDomainItem
          v-for="group in groups"
          :key="group.name"
          :group="group"
          :selected="selected"
          @select="$emit('select', $event)"
          @upload="$emit('upload', $event)"
        />
      </template>
    </div>
  </SurfaceCard>
</template>

<script setup lang="ts">
import DomainCard from '@/components/cards/DomainCard.vue'
import type { PropType } from 'vue'
import CreateDomainButton from '@/components/buttons/CreateDomain.vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedDomainGroup } from '@/interfaces/domain.ts'

const { t } = useI18n()

defineProps({
  domains: {
    type: Array as PropType<UnifiedDomainGroup[]>,
    required: true,
  },
  isUploading: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['add-domain', 'select-domain', 'upload', 'notification-trigger'])
</script>

<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col h-[600px]">
    <h2 class="text-sm font-bold text-gray-800 tracking-wider mb-4 uppercase">
      {{ t('domains.administration.organizationDomains') }}
    </h2>

    <div class="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
      <DomainCard
        v-for="domainGroup in domains"
        :key="domainGroup.name"
        :domain-group="domainGroup"
        :is-uploading="isUploading"
        @upload="$emit('upload', $event)"
        @select-domain="$emit('select-domain', $event)"
        @notification-trigger="$emit('notification-trigger', $event)"
      />
    </div>

    <CreateDomainButton @click="$emit('add-domain')" />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 20px;
}
</style>

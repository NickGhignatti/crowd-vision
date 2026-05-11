<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDomainsStore } from '@/stores/domain.ts'
import { useBuildingsStore } from '@/stores/buildings.ts'
import type { ModelOption } from '@/views/DashboardView.vue'
import BaseDropdown from '@/components/dropdowns/BaseDropdown.vue'
import ModelOptionCard from '@/components/cards/ModelOptionCard.vue'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'model-changed', value: ModelOption): void
}>()

const domainsStore = useDomainsStore()
const buildingsStore = useBuildingsStore()

const models = ref<ModelOption[]>([])
const isDropdownOpen = ref(false)
const selectedModel = ref<ModelOption | null>(null)

const selectModel = (model: ModelOption) => {
  selectedModel.value = model
  isDropdownOpen.value = false
  emit('model-changed', model)
}

const getInitialModels = async () => {
  try {
    await domainsStore.fetchMemberships()
    if (!domainsStore.memberships) return

    await buildingsStore.fetch(domainsStore.memberships)

    const uniqueIds = new Set<string>()
    models.value = buildingsStore.all
      .filter((b: any) => {
        if (uniqueIds.has(b.id)) return false
        uniqueIds.add(b.id)
        return true
      })
      .map((b: any) => ({ id: b.id, name: b.name?.trim() || b.id }))

    if (models.value.length > 0 && models.value[0]) {
      selectModel(models.value[0])
    }
  } catch (error) {
    console.error('Error initializing models:', error)
  }
}

onMounted(getInitialModels)
</script>

<template>
  <BaseDropdown v-model="isDropdownOpen">
    <template #trigger="{ toggle, isOpen }">
      <button
        @click="toggle"
        class="w-full bg-white border border-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-xl inline-flex items-center justify-between hover:bg-slate-50 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm group"
      >
        <span class="flex items-center gap-2 overflow-hidden">
          <i
            class="ph-duotone ph-buildings text-xl text-slate-400 group-hover:text-emerald-500 transition-colors"
          ></i>
          <span class="truncate">{{ selectedModel?.name || t('model.selection') }}</span>
        </span>
        <i
          class="ph-bold ph-caret-down ml-2 text-slate-400 group-hover:text-emerald-500 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
        ></i>
      </button>
    </template>

    <ul class="max-h-60 overflow-y-auto custom-scrollbar p-1">
      <ModelOptionCard
        v-for="model in models"
        :key="model.id"
        :label="model.name"
        :is-selected="selectedModel?.id === model.id"
        @select="selectModel(model)"
      />
      <li v-if="models.length === 0" class="px-4 py-3 text-sm text-slate-400 text-center italic">
        {{ t('model.noBuildings') }}
      </li>
    </ul>
  </BaseDropdown>
</template>

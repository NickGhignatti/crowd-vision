<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import { useUserPermissions } from '@/composables/auth/useUserPermissions.ts'
import type { Building } from '@/models/building.ts'
import BuildingCard from '@/components/cards/BuildingCard.vue'
import CollapsiblePanel from '@/components/panels/CollapsiblePanel.vue'
import PanelHeader from '@/components/panels/PanelHeader.vue'
import ShortSearchInput from '@/components/inputs/search/ShortSearchInput.vue'

interface BuildingOption {
  id: string
  name: string
}

const props = defineProps<{
  buildingOptions: BuildingOption[]
  selectedId?: string | null
  buildingModel: Building | null
  activeFloor: number | null
}>()

const emit = defineEmits<{
  (e: 'json-uploaded'): void
  (e: 'change-building', index: number): void
  (e: 'change-floor', floorY: number | null): void
}>()

const { t } = useI18n()
useUserPermissions()

const isLeftOpen = ref(true)
const showControls = ref(false)
const searchQuery = ref('')

watch(
  () => props.selectedId,
  () => {
    showControls.value = false
  },
)

const toggleControls = (event: Event) => {
  event.stopPropagation()
  showControls.value = !showControls.value
}

const availableFloors = computed(() => {
  if (!props.buildingModel?.rooms) return []
  return Array.from(new Set(props.buildingModel.rooms.map((r) => r.position.y))).sort(
    (a, b) => a - b,
  )
})

const activeFloorModel = computed({
  get: () => props.activeFloor,
  set: (val) => emit('change-floor', val),
})

const filteredBuildings = computed(() => {
  if (!searchQuery.value) return props.buildingOptions
  const query = searchQuery.value.toLowerCase()
  return props.buildingOptions.filter(
    (b) => b.name.toLowerCase().includes(query) || b.id.toLowerCase().includes(query),
  )
})

const buildingsStore = useBuildingsStore()
const domainStore = useDomainsStore()

const handleBuildingUpdated = async () => {
  buildingsStore.invalidate()
  await buildingsStore.fetch(domainStore.memberships || [])
}
</script>

<template>
  <CollapsiblePanel v-model="isLeftOpen" side="left">
    <PanelHeader :title="t('model.data')" side="left" @toggle="isLeftOpen = false">
      <template #search>
        <ShortSearchInput v-model="searchQuery" :placeholder="`${t('commons.search')}...`" />
      </template>
    </PanelHeader>

    <div class="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
      <BuildingCard
        v-for="(item, index) in filteredBuildings"
        :key="item.id"
        :building-id="item.id"
        :building-name="item.name"
        :is-selected="item.id === selectedId"
        :building-model="buildingModel"
        :available-floors="availableFloors"
        :show-controls="showControls"
        v-model:active-floor="activeFloorModel"
        @select="emit('change-building', index)"
        @toggle-controls="toggleControls"
        @building-updated="handleBuildingUpdated"
        class="mb-3"
      />
    </div>
  </CollapsiblePanel>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 2px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #94a3b8;
}
</style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, reactive, ref, watch } from 'vue'
import { useBuildingsStore } from '@/stores/buildings.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import { useUserPermissions } from '@/composables/auth/useUserPermissions.ts'
import type { Building } from '@/models/building.ts'
import BuildingCard from '@/components/cards/BuildingCard.vue'
import CollapsiblePanel from '@/components/panels/CollapsiblePanel.vue'
import DomainBuildingGroup from '@/components/panels/DomainBuildingGroup.vue'
import PanelHeader from '@/components/panels/PanelHeader.vue'
import ShortSearchInput from '@/components/inputs/search/ShortSearchInput.vue'

interface BuildingOption {
  id: string
  name: string
  domains: string[]
}

const props = defineProps<{
  buildingOptions: BuildingOption[]
  selectedId?: string | null
  buildingModel: Building | null
  activeFloor: number | null
}>()

const emit = defineEmits<{
  (e: 'json-uploaded'): void
  (e: 'change-building', id: string): void
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

// Group the (filtered) buildings under each domain they belong to. A building with
// no domain falls into a single "Other" bucket. Domains are sorted alphabetically;
// empty groups never appear, so search naturally prunes domains with no matches.
const groupedBuildings = computed(() => {
  const groups = new Map<string, BuildingOption[]>()
  for (const building of filteredBuildings.value) {
    const domains = building.domains.length ? building.domains : [t('model.ungrouped')]
    for (const domain of domains) {
      const bucket = groups.get(domain) ?? []
      bucket.push(building)
      groups.set(domain, bucket)
    }
  }
  return Array.from(groups.entries())
    .map(([name, buildings]) => ({ name, buildings }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

// Collapse state is keyed by domain name; groups start expanded. An active search
// force-opens every group so matches are never hidden behind a collapsed header.
const collapsed = reactive<Record<string, boolean>>({})
const isGroupOpen = (name: string) => searchQuery.value !== '' || !collapsed[name]
const toggleGroup = (name: string) => {
  collapsed[name] = !collapsed[name]
}

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

    <div class="flex-1 overflow-y-auto p-3 custom-scrollbar">
      <DomainBuildingGroup
        v-for="group in groupedBuildings"
        :key="group.name"
        :name="group.name"
        :count="group.buildings.length"
        :open="isGroupOpen(group.name)"
        @toggle="toggleGroup(group.name)"
      >
        <BuildingCard
          v-for="item in group.buildings"
          :key="item.id"
          :building-id="item.id"
          :building-name="item.name"
          :is-selected="item.id === selectedId"
          :building-model="buildingModel"
          :available-floors="availableFloors"
          :show-controls="showControls"
          v-model:active-floor="activeFloorModel"
          @select="emit('change-building', item.id)"
          @toggle-controls="toggleControls"
          @building-updated="handleBuildingUpdated"
          class="mb-3"
        />
      </DomainBuildingGroup>
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

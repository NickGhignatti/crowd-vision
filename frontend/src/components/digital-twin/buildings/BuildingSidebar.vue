<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Building } from '@/types/digital-twin/building.ts'
import {
  filterBuildings,
  floorsOf,
  groupByDomain,
  type BuildingOption,
} from '@/utils/digital-twin/buildings.ts'
import { useUserPermissions } from '@/composables/authentication/useUserPermissions.ts'
import { useBuildingsStore } from '@/stores/digital-twin/buildings.ts'
import SidePanel from '@/components/digital-twin/sidebar/SidePanel.vue'
import BuildingGroup from '@/components/digital-twin/buildings/BuildingGroup.vue'
import BuildingListItem from '@/components/digital-twin/buildings/BuildingListItem.vue'
import FloorSelect from '@/components/digital-twin/buildings/FloorSelect.vue'
import EditBuildingModal from '@/components/digital-twin/modals/EditBuildingModal.vue'
import SearchInput from '@/components/commons/forms/SearchInput.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'

const props = defineProps<{
  buildings: BuildingOption[]
  selectedId: string | null
  building: Building | null
}>()

const emit = defineEmits<{ select: [id: string]; updated: [] }>()

const floor = defineModel<number | null>('floor', { required: true })

const { t } = useI18n()
const { canEdit } = useUserPermissions()
const buildingsStore = useBuildingsStore()

const query = ref('')
const collapsed = reactive<Record<string, boolean>>({})
const isEditing = ref(false)
const isSaving = ref(false)

const groups = computed(() =>
  groupByDomain(filterBuildings(props.buildings, query.value), t('model.ungrouped')),
)
const floors = computed(() => floorsOf(props.building?.rooms ?? []))
const canEditSelected = computed(() => canEdit(props.building?.domains ?? []))

// A search opens every group, so a match is never hidden behind a collapsed header.
const isOpen = (name: string) => query.value !== '' || !collapsed[name]

const save = async (updates: Partial<Building>) => {
  if (!props.selectedId) return
  isSaving.value = true
  try {
    await buildingsStore.updateBuildingConfig(props.selectedId, updates)
    buildingsStore.invalidate()
    emit('updated')
    isEditing.value = false
  } catch (error) {
    console.error('Error while updating the building:', error)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <SidePanel side="left" icon="buildings" :title="t('model.data')">
    <template #toolbar>
      <SearchInput v-model="query" size="sm" :placeholder="`${t('commons.search')}…`" />
    </template>

    <EmptyState
      v-if="groups.length === 0"
      compact
      icon="buildings"
      :title="t('model.noBuildings')"
    />

    <div class="space-y-2">
      <BuildingGroup
        v-for="group in groups"
        :key="group.name"
        :name="group.name"
        :count="group.buildings.length"
        :open="isOpen(group.name)"
        @toggle="collapsed[group.name] = !collapsed[group.name]"
      >
        <BuildingListItem
          v-for="item in group.buildings"
          :key="item.id"
          :name="item.name"
          :selected="item.id === selectedId"
          :can-edit="canEditSelected"
          @select="emit('select', item.id)"
          @edit="isEditing = true"
        >
          <FloorSelect v-if="floors.length > 1" v-model="floor" :floors="floors" />
        </BuildingListItem>
      </BuildingGroup>
    </div>
  </SidePanel>

  <EditBuildingModal
    :open="isEditing"
    :building="building"
    :saving="isSaving"
    @close="isEditing = false"
    @save="save"
  />
</template>

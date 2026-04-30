<script setup lang="ts">
import type { Building } from '@/models/building'
import { useUserPermissions } from '@/composables/useUserPermissions'
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import BuildingCard from '@/components/cards/BuildingCard.vue'

interface BuildingOption {
  id: string
  name: string
}

import { useBuildingsStore } from '@/stores/buildings.ts'
import { useDomainsStore } from '@/stores/domain.ts'

const emit = defineEmits<{
  (e: 'json-uploaded'): void
  (e: 'change-building', index: number): void
  (e: 'change-floor', floorY: number | null): void
}>()

const props = defineProps<{
  buildingOptions: BuildingOption[]
  selectedId?: string | null
  buildingModel: Building | null
  activeFloor: number | null
}>()

const { t } = useI18n()
useUserPermissions()

const isLeftOpen = ref(true)
const showControls = ref(false)

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

const toggleLeft = () => (isLeftOpen.value = !isLeftOpen.value)

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

const buildingsStore = useBuildingsStore()
const domainStore = useDomainsStore()

const handleBuildingUpdated = async () => {
  buildingsStore.invalidate()
  await buildingsStore.fetch(domainStore.memberships || [])
}
</script>

<template>
  <aside
    class="bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col relative z-30 shadow-sm"
    :class="isLeftOpen ? 'w-80' : 'w-0 overflow-hidden border-none'"
  >
    <div class="p-6 h-full overflow-y-auto w-80 custom-scrollbar">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-lg font-bold text-slate-800">{{ t('model.data') }}</h2>
        <div class="flex items-center gap-2">
          <button
            @click="toggleLeft"
            class="text-slate-400 hover:text-emerald-600 transition-colors p-1"
          >
            <i class="ph-bold ph-caret-left text-xl"></i>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-1">
        <BuildingCard
          v-for="(item, index) in buildingOptions"
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
    </div>
  </aside>

  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 -translate-x-2"
    enter-to-class="opacity-100 translate-x-0"
  >
    <button
      v-if="!isLeftOpen"
      @click="toggleLeft"
      class="absolute left-6 top-4 z-40 bg-white p-2 rounded-lg shadow-lg border border-slate-200 text-slate-600 hover:text-emerald-600 hover:scale-105 transition-all"
      :title="t('commons.open')"
    >
      <i class="ph-bold ph-caret-right text-xl"></i>
    </button>
  </Transition>
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

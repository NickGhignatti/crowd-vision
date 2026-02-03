<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { BuildingPayload, ModelOption } from '@/scripts/schema.ts' //

const models = ref<ModelOption[]>([])

onMounted(() => {
  getInitialModels()
})

const isDropdownOpen = ref<boolean>(false)

const selectedModel = ref<ModelOption | null>(null)

const emit = defineEmits<{
  (e: 'model-changed', value: string): void
}>()

const selectModel = (model: ModelOption) => {
  selectedModel.value = model
  isDropdownOpen.value = false
  emit('model-changed', model.id)
}

const serverUrl = import.meta.env.VITE_SERVER_URL //

const getInitialModels = async () => {
  try {
    const username = localStorage.getItem('username')
    const userDomainResponse = await fetch(`${serverUrl}/auth/domain/${username}`)
    const domainData = await userDomainResponse.json()
    const userDomain = domainData.domain.name as string

    const response = await fetch(`${serverUrl}/twin/buildings/${userDomain}`) //
    if (!response.ok) throw new Error('Failed to fetch')

    const buildings = (await response.json()) as BuildingPayload[]

    models.value = buildings.map((building) => ({
      id: building.id,
    }))

    selectModel({
      id: buildings[0] ? buildings[0].id : '',
    })
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <div class="relative inline-block text-left">
    <button
      @click="isDropdownOpen = !isDropdownOpen"
      class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm group"
    >
      <i class="ph-bold ph-buildings text-lg group-hover:text-emerald-600"></i>
      <span v-if="selectedModel" class="max-w-[100px] truncate">{{ selectedModel.id }}</span>
      <i
        class="ph-bold ph-caret-down text-xs transition-transform duration-200"
        :class="{ 'rotate-180': isDropdownOpen }"
      ></i>
    </button>

    <div
      v-if="isDropdownOpen"
      class="absolute right-0 lg:left-1/2 lg:-translate-x-1/2 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200"
    >
      <div
        class="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2"
      >
        <i class="ph-bold ph-map-pin"></i>
        Select Building/Model
      </div>
      <button
        v-for="model in models"
        :key="model.id"
        @click="selectModel(model)"
        class="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors flex items-center justify-between"
        :class="
          selectedModel?.id === model.id
            ? 'text-emerald-600 font-bold bg-emerald-50/50'
            : 'text-slate-600'
        "
      >
        <div class="flex items-center gap-2">
          <i class="ph-bold ph-house-line"></i>
          {{ model.id }}
        </div>
        <i v-if="selectedModel?.id === model.id" class="ph-bold ph-check"></i>
      </button>
    </div>
  </div>
</template>

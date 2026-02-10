<script setup lang="ts">
import type { DomainMembership } from '@/models/domain'
import type { BuildingPayload } from '@/models/building'

import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

export interface ModelOption {
  id: string
  name: string
}

const emit = defineEmits<{
  (e: 'model-changed', value: string): void
}>()

const models = ref<ModelOption[]>([])
const isDropdownOpen = ref<boolean>(false)
const selectedModel = ref<ModelOption | null>(null)
const serverUrl = import.meta.env.VITE_SERVER_URL

const selectModel = (model: ModelOption) => {
  selectedModel.value = model
  isDropdownOpen.value = false
  emit('model-changed', model.id)
}

const getInitialModels = async () => {
  try {
    const username = localStorage.getItem('username')
    if (!username) return

    const authRes = await fetch(`${serverUrl}/auth/domains/${username}`)
    if (!authRes.ok) throw new Error('Failed to fetch user domains')

    const authData = await authRes.json()
    const memberships = authData.domains as DomainMembership[]

    const allBuildings: BuildingPayload[] = []

    // Fetch Buildings for each Domain
    await Promise.all(
      memberships.map(async (m) => {
        try {
          const buildRes = await fetch(`${serverUrl}/twin/buildings/${m.domainName}`)
          if (buildRes.ok) {
            const domainBuildings = (await buildRes.json()) as BuildingPayload[]
            allBuildings.push(...domainBuildings)
          }
        } catch (err) {
          console.warn(`Failed to fetch buildings for domain ${m.domainName}`, err)
        }
      }),
    )

    const uniqueIds = new Set()
    models.value = allBuildings
      .filter((b) => {
        if (uniqueIds.has(b.id)) return false
        uniqueIds.add(b.id)
        return true
      })
      .map((b) => ({
        id: b.id,
        name: b.id,
      }))

    if (models.value.length > 0 && models.value[0]) {
      selectModel(models.value[0])
    }
  } catch (error) {
    console.error('Error initializing models:', error)
  }
}

onMounted(() => {
  getInitialModels()
})
</script>

<template>
  <div class="relative min-w-[200px]">
    <button
      @click="isDropdownOpen = !isDropdownOpen"
      class="w-full bg-white border border-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-xl inline-flex items-center justify-between hover:bg-slate-50 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm group"
    >
      <div class="flex items-center gap-2 overflow-hidden">
        <i
          class="ph-duotone ph-buildings text-xl text-slate-400 group-hover:text-emerald-500 transition-colors"
        ></i>
        <span class="truncate">
          {{ selectedModel?.name || t('model.selection') }}
        </span>
      </div>
      <i
        class="ph-bold ph-caret-down ml-2 text-slate-400 group-hover:text-emerald-500 transition-transform duration-200"
        :class="{ 'rotate-180': isDropdownOpen }"
      ></i>
    </button>

    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <div
        v-if="isDropdownOpen"
        class="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden origin-top-right"
      >
        <ul class="max-h-60 overflow-y-auto custom-scrollbar p-1">
          <li v-for="model in models" :key="model.id">
            <button
              @click="selectModel(model)"
              class="w-full text-left px-4 py-2.5 text-sm rounded-lg transition-colors flex items-center justify-between group"
              :class="
                selectedModel?.id === model.id
                  ? 'bg-emerald-50 text-emerald-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              "
            >
              <span>{{ model.name }}</span>
              <i
                v-if="selectedModel?.id === model.id"
                class="ph-bold ph-check text-emerald-600"
              ></i>
            </button>
          </li>
          <li
            v-if="models.length === 0"
            class="px-4 py-3 text-sm text-slate-400 text-center italic"
          >
            {{ t('model.noBuildings') }}
          </li>
        </ul>
      </div>
    </Transition>

    <div
      v-if="isDropdownOpen"
      class="fixed inset-0 z-40 bg-transparent"
      @click="isDropdownOpen = false"
    ></div>
  </div>
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
</style>

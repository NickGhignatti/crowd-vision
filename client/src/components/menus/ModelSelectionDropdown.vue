<script setup lang="ts">

import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ModelOption } from '@/views/DashboardView.vue'

const { t } = useI18n()

const props = defineProps<{
  selectedModel: ModelOption | null
  models: ModelOption[]
}>()

const emit = defineEmits<{
  (e: 'model-changed', value: ModelOption): void
}>()

const selectModel = (model: ModelOption) => {
  isDropdownOpen.value = false
  emit('model-changed', model)
} 

const isDropdownOpen = ref<boolean>(false)

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
          <li v-for="model in props.models" :key="model.id">
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

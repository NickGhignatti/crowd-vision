<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  placeholder?: string
}>()

const model = defineModel<string>({ required: true })

const isOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)

const toggle = async () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    model.value = ''
    await nextTick()
    searchInput.value?.focus()
  } else {
    model.value = ''
  }
}

defineExpose({ isOpen })
</script>

<template>
  <div
    class="flex items-center transition-all duration-300 ease-in-out"
    :class="isOpen ? 'w-full bg-slate-100 rounded-md mr-2' : ''"
  >
    <button
      v-if="!isOpen"
      @click="toggle"
      class="text-slate-400 hover:text-emerald-600 transition-colors p-1"
      :title="t('commons.search')"
    >
      <i class="ph-bold ph-magnifying-glass text-xl"></i>
    </button>

    <div v-else class="flex items-center w-full px-2 py-1">
      <i class="ph-bold ph-magnifying-glass text-slate-400 text-lg mr-2"></i>
      <input
        ref="searchInput"
        v-model="model"
        type="text"
        :placeholder="placeholder ?? t('commons.search') + '...'"
        class="bg-transparent border-none outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
        @keydown.esc="toggle"
      />
      <button @click="toggle" class="text-slate-400 hover:text-red-500 ml-1 flex-shrink-0">
        <i class="ph-bold ph-x text-lg"></i>
      </button>
    </div>
  </div>
</template>

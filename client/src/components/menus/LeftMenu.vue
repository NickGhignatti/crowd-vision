<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { BuildingPayload } from '@/scripts/schema.ts'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  (e: 'json-uploaded'): void
  (e: 'change-building', index: number): void
}>()

defineProps<{
  structureIds: string[]
  selectedId?: string | null
}>()

onMounted(() => {
  askForRankLevel()
})

let allowed = false

const askForRankLevel = async () => {
  if (!import.meta.env.VITE_SERVER_URL) return

  try {
    const username = localStorage.getItem('username')
    if (!username) return

    const response = await fetch(serverUrl + '/auth/domain/level/' + username)
    const data = await response.json()
    const level = data.domainLevel as number
    allowed = level == 1
  } catch (e) {
    console.warn('Could not fetch rank level', e)
  }
}

const isLeftOpen = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const serverUrl = import.meta.env.VITE_SERVER_URL

const toggleLeft = () => (isLeftOpen.value = !isLeftOpen.value)

const triggerUpload = () => {
  fileInput.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const file = target.files[0]

  if (file != undefined) {
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      alert('Please upload a valid JSON file')
      return
    }

    try {
      isUploading.value = true
      const payload = JSON.parse(await file.text()) as BuildingPayload

      await fetch(serverUrl + `/twin/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      emit('json-uploaded')
    } catch (e) {
      console.error('Upload failed', e)
      alert('Failed to upload building data')
    } finally {
      isUploading.value = false
    }
  }
}

const { t } = useI18n()
</script>

<template>
  <aside
    class="bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col relative z-30 shadow-sm"
    :class="isLeftOpen ? 'w-80' : 'w-0 overflow-hidden border-none'"
  >
    <div class="p-6 h-full overflow-y-auto w-80">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-lg font-bold text-slate-800">{{ t('model.LeftMenu.data') }}</h2>
        <div class="flex items-center gap-2">
          <div v-if="allowed">
            <button
              @click="triggerUpload"
              class="text-slate-400 hover:text-emerald-600 transition-colors p-1"
              title="Upload JSON"
              :disabled="isUploading"
            >
              <i
                class="ph-bold ph-upload-simple text-xl"
                :class="{ 'animate-pulse text-emerald-600': isUploading }"
              ></i>
            </button>

            <input
              ref="fileInput"
              type="file"
              accept=".json"
              class="hidden"
              @change="handleFileUpload"
            />
          </div>

          <button
            @click="toggleLeft"
            class="text-slate-400 hover:text-emerald-600 transition-colors p-1"
          >
            <i class="ph-bold ph-caret-left text-xl"></i>
          </button>
        </div>
      </div>

      <div v-for="(item, index) in structureIds" :key="item" class="mb-3">
        <div
          class="p-4 rounded-xl border cursor-pointer transition-all duration-200 ease-in-out"
          :class="[
            item === selectedId
              ? 'border-emerald-500 bg-emerald-50 shadow-md ring-1 ring-emerald-500'
              : 'border-slate-100 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-md hover:-translate-y-0.5',
          ]"
          @click="emit('change-building', index)"
        >
          <span
            class="text-xs font-bold uppercase tracking-wider"
            :class="item === selectedId ? 'text-emerald-700' : 'text-emerald-600'"
          >
            {{ t('model.LeftMenu.structureName') }}:
          </span>
          <p class="text-slate-700 font-medium mt-1">{{ item }}</p>
        </div>
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
      title="Open Sidebar"
    >
      <i class="ph-bold ph-caret-right text-xl"></i>
    </button>
  </Transition>
</template>

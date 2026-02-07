<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BuildingPayload } from '@/scripts/schema'
import { useI18n } from 'vue-i18n'
import { useUserPermissions } from '@/composables/useUserPermissions'

const emit = defineEmits<{
  (e: 'json-uploaded'): void
  (e: 'change-building', index: number): void
  (e: 'change-floor', floorY: number | null): void
}>()

const props = defineProps<{
  structureIds: string[]
  selectedId?: string | null
  building: BuildingPayload | null
  activeFloor: number | null
}>()

const { t } = useI18n()
const { memberships } = useUserPermissions()

// User can upload if they are an admin/owner of AT LEAST one domain
const canUpload = computed(() => {
  return memberships.value.some((m) => ['owner', 'admin'].includes(m.role))
})

const selectedFloorModel = computed({
  get: () => props.activeFloor,
  set: (val) => emit('change-floor', val),
})

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

      // The backend should ideally verify if the user has access
      // to the domain specified inside this JSON payload.
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
      if (fileInput.value) fileInput.value.value = ''
    }
  }
}

const availableFloors = computed(() => {
  if (!props.building || !props.building.rooms) return []
  const yCoords = new Set(props.building.rooms.map((r) => r.position.y))
  return Array.from(yCoords).sort((a, b) => a - b)
})
</script>

<template>
  <aside
    class="bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col relative z-30 shadow-sm"
    :class="isLeftOpen ? 'w-80' : 'w-0 overflow-hidden border-none'"
  >
    <div class="p-6 h-full overflow-y-auto w-80 custom-scrollbar">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-lg font-bold text-slate-800">{{ t('model.LeftMenu.data') }}</h2>
        <div class="flex items-center gap-2">
          <div v-if="canUpload">
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

      <div class="flex-1 overflow-y-auto p-3 space-y-1">
        <div v-for="(item, index) in structureIds" :key="item" class="mb-3">
          <div
            class="p-4 rounded-xl border cursor-pointer transition-all duration-200 ease-in-out relative group"
            :class="[
              item === selectedId
                ? 'border-emerald-500 bg-emerald-50 shadow-md ring-1 ring-emerald-500'
                : 'border-slate-100 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-md hover:-translate-y-0.5',
            ]"
            @click="emit('change-building', index)"
          >
            <div class="pr-8">
              <span
                class="text-xs font-bold uppercase tracking-wider"
                :class="item === selectedId ? 'text-emerald-700' : 'text-emerald-600'"
              >
                {{ t('model.LeftMenu.structureName') }}:
              </span>
              <p class="text-slate-700 font-medium mt-1 truncate">{{ item }}</p>
            </div>

            <button
              v-if="item === selectedId"
              @click="toggleControls"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all"
              :class="
                showControls
                  ? 'bg-emerald-200/50 text-emerald-700'
                  : 'text-emerald-600/70 hover:bg-emerald-100 hover:text-emerald-700'
              "
              title="Toggle Controls"
            >
              <i class="ph-bold ph-sliders-horizontal text-xl"></i>
            </button>
          </div>

          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div
              v-if="
                item === selectedId && showControls && props.building && availableFloors.length > 0
              "
              class="mt-2 ml-4 relative"
            >
              <div
                class="absolute -left-4 top-0 bottom-4 w-4 border-l-2 border-b-2 border-slate-200 rounded-bl-xl pointer-events-none"
              ></div>

              <div class="bg-slate-50 rounded-xl border border-slate-200 p-3 shadow-sm">
                <label
                  class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1"
                >
                  Floor Selection
                </label>

                <div class="relative">
                  <select
                    v-model="selectedFloorModel"
                    class="w-full bg-white text-slate-700 text-xs font-medium rounded-lg px-3 py-2.5 border border-slate-200 outline-none shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer hover:border-emerald-300 transition-colors"
                  >
                    <option :value="null">All Floors</option>
                    <option v-for="(floorY, idx) in availableFloors" :key="floorY" :value="floorY">
                      Floor {{ idx }} ({{ floorY }}m)
                    </option>
                  </select>

                  <i
                    class="ph-bold ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-sm"
                  ></i>
                </div>
              </div>
            </div>
          </Transition>
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

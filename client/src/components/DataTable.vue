<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

export interface TableHeader {
  key: string
  label: string
  cellClass?: string
}

const props = withDefaults(
  defineProps<{
    headers: TableHeader[]
    items: any[]
    itemsPerPage?: number
  }>(),
  {
    itemsPerPage: 7,
  },
)

const currentPage = ref(1)

const totalPages = computed(() => Math.ceil(props.items.length / props.itemsPerPage))

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * props.itemsPerPage
  const end = start + props.itemsPerPage
  return props.items.slice(start, end)
})

const emptyRows = computed(() => {
  const length = paginatedItems.value.length
  if (length === 0) return 0
  return Math.max(0, props.itemsPerPage - length)
})

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  } else if (isAutoPlaying.value) {
    currentPage.value = 1
  }
}

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

const isAutoPlaying = ref(false)
let autoPlayInterval: number | undefined

const toggleAutoPlay = () => {
  isAutoPlaying.value = !isAutoPlaying.value

  if (isAutoPlaying.value) {
    autoPlayInterval = setInterval(() => {
      nextPage()
    }, 2000)
  } else {
    clearInterval(autoPlayInterval)
  }
}

onUnmounted(() => {
  if (autoPlayInterval) clearInterval(autoPlayInterval)
})

const { t } = useI18n()
</script>

<template>
  <div
    class="w-full max-w-5xl bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden flex flex-col"
  >
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead class="bg-emerald-600 text-white">
          <tr>
            <th
              v-for="header in headers"
              :key="header.key"
              class="p-5 font-semibold text-sm uppercase tracking-wide border-r border-emerald-500 last:border-r-0"
            >
              {{ t(header.label) }}
            </th>
          </tr>
        </thead>

        <tbody class="divide-y-2 divide-slate-200">
          <tr
            v-for="(item, index) in paginatedItems"
            :key="index"
            class="hover:bg-slate-50 transition-colors duration-150"
          >
            <td
              v-for="header in headers"
              :key="header.key"
              class="p-5 border-r border-slate-200 last:border-r-0"
              :class="header.cellClass"
            >
              <slot :name="header.key" :item="item" :value="item[header.key]">
                {{ item[header.key] }}
              </slot>
            </td>
          </tr>

          <tr
            v-for="n in emptyRows"
            :key="'empty-' + n"
            class="hover:bg-slate-50 transition-colors duration-150"
          >
            <td
              v-for="header in headers"
              :key="header.key"
              class="p-5 border-r border-slate-200 last:border-r-0"
              :class="header.cellClass"
            >
              &nbsp;
            </td>
          </tr>

          <tr v-if="paginatedItems.length === 0">
            <td :colspan="headers.length" class="p-8 text-center text-slate-500">
              No data available
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      class="bg-slate-50 p-4 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-4"
    >
      <span class="text-sm text-slate-600 font-medium">
        {{ t('table.index.page') }}
        <span class="text-emerald-700 font-bold">{{ currentPage }}</span> {{ t('table.index.of') }}
        {{ totalPages }}
      </span>

      <div class="flex items-center gap-2">
        <button
          @click="toggleAutoPlay"
          class="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-2 mr-2"
          :class="
            isAutoPlaying
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
          "
        >
          <span v-if="isAutoPlaying" class="relative flex h-2 w-2">
            <span
              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
            ></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          {{ isAutoPlaying ? t('table.buttons.stop') : t('table.buttons.auto') }}
        </button>

        <button
          @click="prevPage"
          :disabled="currentPage === 1"
          class="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {{ t('table.buttons.previous') }}
        </button>

        <button
          @click="nextPage"
          :disabled="currentPage === totalPages && !isAutoPlaying"
          class="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {{ t('table.buttons.next') }}
        </button>
      </div>
    </div>
  </div>
</template>

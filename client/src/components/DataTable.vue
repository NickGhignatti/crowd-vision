<script setup lang="ts">
export interface TableHeader {
  key: string
  label: string
  cellClass?: string
}

defineProps<{
  headers: TableHeader[]
  items: any[]
}>()
</script>

<template>
  <div
    class="w-full max-w-5xl bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden"
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
              {{ header.label }}
            </th>
          </tr>
        </thead>

        <tbody class="divide-y-2 divide-slate-200">
          <tr
            v-for="(item, index) in items"
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
        </tbody>
      </table>
    </div>
  </div>
</template>

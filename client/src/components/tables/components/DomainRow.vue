<script setup lang="ts">

interface Props {
  id: number
  name: string
  isSubscribed: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'subscribe', id: number): void
  (e: 'unsubscribe', id: number): void
}>()
</script>

<template>
  <td
    class="p-4 border-r border-slate-100 last:border-r-0 text-slate-700 font-medium group-hover:text-slate-900"
  >
    {{ name }}
  </td>

  <td class="p-2 border-r border-slate-100 last:border-r-0">
    <div class="flex items-center justify-center">
      <button
        v-if="!props.isSubscribed"
        @click="$emit('subscribe', id)"
        class="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-emerald-600 transition-all hover:bg-emerald-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        <i class="ph-bold ph-user-plus text-xl"></i>
      </button>

      <button
        v-else
        @click="$emit('unsubscribe', id)"
        class="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 transition-all hover:bg-red-600 hover:border-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        <i class="ph-bold ph-user-minus text-xl"></i>
      </button>
    </div>
  </td>
</template>

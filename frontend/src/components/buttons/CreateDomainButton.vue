<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineEmits(['click'])

const { t } = useI18n()
</script>

<template>
  <button
    @click="$emit('click')"
    class="mt-4 w-full py-4 border-2 border-dashed border-emerald-300 bg-emerald-50/50 rounded-xl text-emerald-700 font-semibold hover:bg-emerald-100 hover:border-emerald-400 transition-all flex items-center justify-center gap-2 group"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="w-5 h-5 group-hover:scale-110 transition-transform"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
    {{ t('domains.administration.addNewDomain') }}
  </button>
</template>

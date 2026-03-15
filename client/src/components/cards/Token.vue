<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps({
  token: {
    type: String,
    required: true,
  },
})

defineEmits(['generate'])

const { t } = useI18n()
</script>

<template>
  <div
    class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-between h-[600px] py-10"
  >
    <h2 class="text-sm font-bold text-gray-800 tracking-wider w-full text-left uppercase">
      {{ t('domains.administration.organizationToken') }}
    </h2>

    <div class="relative flex items-center justify-center my-8">
      <div class="absolute w-80 h-80 rounded-full bg-emerald-50 opacity-70 animate-pulse"></div>

      <div
        class="relative w-72 h-72 rounded-full bg-gradient-to-br from-emerald-200 via-emerald-400 to-green-600 flex items-center justify-center shadow-lg p-2"
      >
        <div
          class="w-full h-full bg-white rounded-full flex items-center justify-center relative overflow-hidden"
        >
          <div
            class="absolute inset-0 opacity-5"
            style="
              background-image: repeating-radial-gradient(
                circle at 0 0,
                transparent 0,
                #000 1px,
                transparent 1px,
                transparent 100%
              );
              background-size: 20px 20px;
            "
          ></div>

          <span class="text-6xl font-extrabold text-gray-800 tracking-widest z-10 font-mono">
            {{ token }}
          </span>
        </div>
      </div>
    </div>

    <div class="flex flex-col items-center gap-4">
      <div
        class="bg-emerald-100 text-emerald-800 px-5 py-1.5 rounded-full text-sm font-semibold tracking-wide"
      >
        {{ t('domains.administration.activeToken') }}
      </div>

      <button
        @click="$emit('generate')"
        class="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all"
      >
        {{ t('domains.administration.generateNewToken') }}
      </button>
    </div>
  </div>
</template>

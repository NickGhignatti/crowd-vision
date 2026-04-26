<script setup lang="ts">
import UploadButton from '@/components/buttons/UploadButton.vue'
import { useNotificationStore } from '@/stores/notification.ts'

defineProps({
  name: { type: String, required: true },
  displayName: { type: String, required: true },
  parentDomainName: { type: String, required: true },
  canUpload: { type: Boolean, default: false },
  isUploading: { type: Boolean, default: false },
})

defineEmits(['select', 'upload', 'notification-trigger'])

const notificationStore = useNotificationStore()
</script>

<template>
  <div
    @click="$emit('select', name)"
    class="group flex items-center justify-between p-3 pl-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:shadow-md cursor-pointer transition-all duration-300"
  >
    <div class="flex items-baseline gap-1">
      <span class="text-md font-bold text-slate-700 group-hover:text-emerald-700 transition-colors">
        {{ displayName }}
      </span>
      <span class="text-xs font-semibold text-slate-400">.{{ parentDomainName }}</span>
    </div>

    <div class="flex items-center gap-2">
      <button
        @click.stop="$emit('notification-trigger', displayName + '.' + parentDomainName)"
        class="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors duration-200"
        aria-label="Trigger notification"
      >
        <i
          class="ph text-xl"
          :class="
            notificationStore.isSubscribed(displayName + '.' + parentDomainName)
              ? 'ph-bell'
              : 'ph-bell-slash'
          "
        ></i>
      </button>

      <UploadButton
        v-if="canUpload"
        size="sm"
        :is-uploading="isUploading"
        @click="$emit('upload', name)"
      />

      <div
        class="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-600 group-hover:border-emerald-200 group-hover:bg-white group-hover:translate-x-1 transition-all duration-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  </div>
</template>

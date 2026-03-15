<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PropType } from 'vue'
import SubdomainCard from '@/components/cards/SubDomainCard.vue'
import UploadButton from '@/components/buttons/UploadButton.vue'
import { useI18n } from 'vue-i18n'

interface SubdomainCard {
  name: string
  displayName: string
}

interface UnifiedDomainGroup {
  name: string
  role: string
  canUpload: boolean
  subdomains: SubdomainCard[]
}

const props = defineProps({
  domainGroup: {
    type: Object as PropType<UnifiedDomainGroup>,
    required: true,
  },
  isUploading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['upload', 'select-domain'])
const { t } = useI18n()

const isOpen = ref(false)

const toggleAccordion = () => {
  if (props.domainGroup.subdomains.length > 0) {
    isOpen.value = !isOpen.value
  } else {
    emit('select-domain', props.domainGroup.name)
  }
}

const formattedRole = computed(() => {
  const role = props.domainGroup.role.toLowerCase()
  if (role === 'admin') return t('domains.roles.admin')
  if (role === 'business_admin') return t('domains.roles.businessAdmin')
  if (role === 'business_staff') return t('domains.roles.businessStaff')
  return t('domains.roles.member')
})

const roleBadgeClass = computed(() => {
  const role = props.domainGroup.role.toLowerCase()
  if (role === 'admin') return 'bg-purple-100 text-purple-700 border-purple-200'
  if (role === 'business_admin') return 'bg-blue-100 text-blue-700 border-blue-200'
  if (role === 'business_staff') return 'bg-teal-100 text-teal-700 border-teal-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
})
</script>

<template>
  <div
    class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-300"
  >
    <!-- Domain header row -->
    <div
      @click="toggleAccordion"
      class="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors relative z-10"
      :class="{ 'bg-slate-50 border-b border-slate-100': isOpen }"
    >
      <div class="flex items-center gap-3">
        <span class="text-xl font-extrabold text-slate-800 tracking-tight">
          {{ domainGroup.name }}
        </span>
        <span
          class="text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-sm tracking-wider"
          :class="roleBadgeClass"
        >
          {{ formattedRole }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <UploadButton
          v-if="domainGroup.canUpload"
          :is-uploading="isUploading"
          @click="$emit('upload', domainGroup.name)"
        />

        <!-- Accordion chevron (has subdomains) -->
        <div
          v-if="domainGroup.subdomains.length > 0"
          class="w-9 h-9 flex items-center justify-center rounded-full transition-transform duration-300 text-slate-400"
          :class="
            isOpen ? 'rotate-180 bg-slate-200 text-slate-700' : 'bg-slate-100 hover:bg-slate-200'
          "
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>

        <!-- Navigate arrow (no subdomains) -->
        <div
          v-else
          @click.stop="$emit('select-domain', domainGroup.name)"
          class="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:border-emerald-200 hover:translate-x-1 transition-all duration-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </div>

    <!-- Subdomains accordion -->
    <div v-show="isOpen" class="bg-slate-50 px-5 pb-5 pt-3 space-y-2">
      <SubdomainCard
        v-for="sub in domainGroup.subdomains"
        :key="sub.name"
        :name="sub.name"
        :display-name="sub.displayName"
        :parent-domain-name="domainGroup.name"
        :can-upload="domainGroup.canUpload"
        :is-uploading="isUploading"
        @select="$emit('select-domain', $event)"
        @upload="$emit('upload', $event)"
      />
    </div>
  </div>
</template>

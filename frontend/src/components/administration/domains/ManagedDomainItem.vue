<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedDomainGroup } from '@/interfaces/domain.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import RoleBadge from '@/components/domains/badges/RoleBadge.vue'
import AlertSubscriptionMenu from '@/components/administration/domains/AlertSubscriptionMenu.vue'
import SubdomainItem from '@/components/administration/domains/SubdomainItem.vue'

const props = defineProps<{ group: UnifiedDomainGroup; selected: string | null }>()

const emit = defineEmits<{ select: [domain: string]; upload: [domain: string] }>()

const { t } = useI18n()
const expanded = ref(false)

const selectDomain = () => {
  if (props.group.subdomains.length) expanded.value = !expanded.value
  emit('select', props.group.name)
}
</script>

<template>
  <article
    class="rounded-2xl bg-surface-container-low transition-shadow"
    :class="selected === group.name && 'ring-2 ring-primary/50'"
  >
    <div class="flex items-center gap-2 px-3 py-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 text-left"
        :aria-expanded="group.subdomains.length ? expanded : undefined"
        @click="selectDomain"
      >
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg text-primary"
        >
          <BaseIcon name="globe-hemisphere-west" />
        </span>
        <span class="min-w-0">
          <span class="block truncate text-title-sm">{{ group.name }}</span>
          <span class="text-label-stat text-on-surface-variant">
            {{
              t(
                'administration.subdomainCount',
                { count: group.subdomains.length },
                group.subdomains.length,
              )
            }}
          </span>
        </span>
      </button>
      <RoleBadge :role="group.role" size="sm" class="hidden sm:inline-flex" />
      <AlertSubscriptionMenu :domain-name="group.name" />
      <IconButton
        v-if="group.canUpload"
        icon="upload-simple"
        variant="outlined"
        :label="t('administration.registerBuilding')"
        @click="emit('upload', group.name)"
      />
      <BaseIcon
        v-if="group.subdomains.length"
        name="caret-down"
        class="text-outline transition-transform"
        :class="expanded && 'rotate-180'"
      />
    </div>

    <ul v-if="expanded" class="space-y-1.5 px-3 pb-3">
      <SubdomainItem
        v-for="sub in group.subdomains"
        :key="sub.name"
        :name="sub.name"
        :label="sub.displayName"
        :parent="group.name"
        :selected="selected === sub.name"
        :can-upload="group.canUpload"
        @select="emit('select', sub.name)"
        @upload="emit('upload', sub.name)"
      />
    </ul>
  </article>
</template>

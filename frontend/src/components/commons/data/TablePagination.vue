<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { pageCount, pageRange, pageWindow } from '@/utils/pagination.ts'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import SelectInput from '@/components/commons/forms/SelectInput.vue'

const props = withDefaults(defineProps<{ total: number; perPageOptions?: number[] }>(), {
  perPageOptions: () => [8, 15, 25, 50],
})

const page = defineModel<number>('page', { required: true })
const perPage = defineModel<number>('perPage', { required: true })

const { t } = useI18n()

const pages = computed(() => pageCount(props.total, perPage.value))
const range = computed(() => pageRange(page.value, perPage.value, props.total))
const items = computed(() => pageWindow(page.value, pages.value))
const perPageChoices = computed(() =>
  props.perPageOptions.map((value) => ({ value, label: String(value) })),
)
</script>

<template>
  <div class="flex flex-col items-center justify-between gap-3 px-5 pb-4 pt-3 lg:flex-row">
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 text-label-stat text-on-surface-variant"
    >
      <i18n-t
        keypath="commons.pagination.showing"
        tag="span"
        scope="global"
        class="text-on-surface"
      >
        <template #from
          ><strong class="tabular-nums">{{ range.from }}</strong></template
        >
        <template #to
          ><strong class="tabular-nums">{{ range.to }}</strong></template
        >
        <template #total
          ><strong class="tabular-nums">{{ range.total }}</strong></template
        >
      </i18n-t>
      <slot name="meta" />
      <label class="flex items-center gap-2">
        {{ t('commons.pagination.rowsPerPage') }}
        <SelectInput v-model="perPage" :options="perPageChoices" size="sm" class="w-20" />
      </label>
    </div>

    <nav class="flex items-center gap-1" :aria-label="t('commons.pagination.label')">
      <IconButton
        icon="caret-double-left"
        size="sm"
        variant="outlined"
        :label="t('commons.pagination.first')"
        :disabled="page === 1"
        @click="page = 1"
      />
      <BaseButton size="sm" :disabled="page === 1" @click="page--">
        {{ t('commons.previous') }}
      </BaseButton>
      <template v-for="(item, index) in items" :key="`${item}-${index}`">
        <span v-if="item === 'gap'" class="px-1 text-on-surface-variant">…</span>
        <button
          v-else
          type="button"
          class="flex size-8 items-center justify-center rounded-xl text-label-stat tabular-nums transition-colors"
          :class="
            item === page
              ? 'bg-primary font-bold text-on-primary shadow-soft'
              : 'font-medium text-on-surface hover:bg-surface-container-low'
          "
          :aria-current="item === page ? 'page' : undefined"
          @click="page = item"
        >
          {{ item }}
        </button>
      </template>
      <BaseButton
        size="sm"
        variant="primary"
        icon-right="caret-right"
        :disabled="page >= pages"
        @click="page++"
      >
        {{ t('commons.next') }}
      </BaseButton>
    </nav>
  </div>
</template>

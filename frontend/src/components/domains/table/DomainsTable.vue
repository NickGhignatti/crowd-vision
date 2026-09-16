<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DomainRow as Row } from '@/interfaces/domain.ts'
import { useDomainsStore } from '@/stores/domain.ts'
import DomainRow from '@/components/domains/table/DomainRow.vue'
import EmptyState from '@/components/commons/base/EmptyState.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'

defineProps<{ rows: Row[]; loading: boolean }>()

const emit = defineEmits<{ changed: [] }>()

const HEADERS = [
  { key: 'name', label: 'domains.table.headers.name', align: 'text-left' },
  { key: 'members', label: 'domains.table.headers.members', align: 'text-center' },
  { key: 'buildings', label: 'domains.table.headers.buildings', align: 'text-center' },
  { key: 'role', label: 'domains.table.headers.role', align: 'text-center' },
  { key: 'action', label: 'domains.table.headers.action', align: 'text-right' },
]

const { t } = useI18n()
const domainsStore = useDomainsStore()

const busyName = ref<string | null>(null)
// The app has no toast system, so a blocked leave explains itself inline.
const actionError = ref<string | null>(null)

const run = async (row: Row, action: () => Promise<unknown>) => {
  if (row.isPrivate) return
  busyName.value = row.name
  actionError.value = null
  try {
    await action()
    emit('changed')
  } catch (error) {
    if ((error as { code?: string })?.code === 'LAST_ADMIN') {
      actionError.value = t('domains.errors.lastAdmin')
    }
    console.error(error)
  } finally {
    busyName.value = null
  }
}

const join = (row: Row) => run(row, () => domainsStore.subscribeToDomain(row))
const leave = (row: Row) => run(row, () => domainsStore.unsubscribeFromDomain(row.name))
</script>

<template>
  <div>
    <FormMessage
      v-if="actionError"
      tone="warning"
      dismissible
      class="m-3"
      @dismiss="actionError = null"
    >
      {{ actionError }}
    </FormMessage>

    <div class="overflow-x-auto p-2">
      <table class="w-full min-w-[720px] border-separate border-spacing-0">
        <thead>
          <tr class="h-12 text-label-header uppercase text-on-primary">
            <th
              v-for="header in HEADERS"
              :key="header.key"
              scope="col"
              class="whitespace-nowrap bg-primary px-4 py-3 first:rounded-l-xl last:rounded-r-xl"
              :class="header.align"
            >
              {{ t(header.label) }}
            </th>
          </tr>
        </thead>
        <tbody class="text-body-md">
          <template v-if="loading && rows.length === 0">
            <tr v-for="n in 5" :key="n" class="h-14">
              <td v-for="header in HEADERS" :key="header.key" class="px-4">
                <div class="h-3 w-2/3 animate-pulse rounded bg-surface-container" />
              </td>
            </tr>
          </template>
          <tr v-else-if="rows.length === 0">
            <td :colspan="HEADERS.length">
              <EmptyState icon="magnifying-glass" :title="t('domains.inputs.notFound')" />
            </td>
          </tr>
          <template v-else>
            <DomainRow
              v-for="row in rows"
              :key="row.name"
              :row="row"
              :busy="busyName === row.name"
              @join="join(row)"
              @leave="leave(row)"
            />
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

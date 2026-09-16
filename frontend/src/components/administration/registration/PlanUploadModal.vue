<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PLAN_EXTENSIONS,
  declaredScaleOf,
  type PlanUpload,
} from '@/utils/administration/floorplan/index.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import IconButton from '@/components/commons/base/IconButton.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: []; confirm: [uploads: PlanUpload[], unitsPerMetre: number] }>()

/** A row's floor is its position in the list, so removing one renumbers the rest. */
interface Row {
  file: { name: string; bytes: ArrayBuffer } | null
}

const ACCEPT = PLAN_EXTENSIONS.map((extension) => `.${extension}`).join(',')

const { t } = useI18n()
const rows = ref<Row[]>([{ file: null }])
const unitsPerMetre = ref(1)
const scaleFromDrawing = ref(false)
const readError = ref<string | null>(null)

const filled = computed(() => rows.value.filter((row) => row.file))
const canConfirm = computed(() => filled.value.length > 0 && unitsPerMetre.value > 0)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    rows.value = [{ file: null }]
    unitsPerMetre.value = 1
    scaleFromDrawing.value = false
    readError.value = null
  },
)

// Keep exactly one empty row at the end, so the next floor is always one click away.
const ensureTrailingRow = () => {
  if (rows.value.at(-1)?.file !== null) rows.value.push({ file: null })
}

const onFile = async (index: number, event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  readError.value = null

  // Bytes, not text: File.text() would corrupt a binary PDF.
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    readError.value = t('model.register.plan.unreadable')
    return
  }
  rows.value[index]!.file = { name: file.name, bytes }

  // DXF declares its units; the field stays editable because drawings often declare them wrong.
  const declared = declaredScaleOf(file.name, bytes)
  if (declared !== null && !scaleFromDrawing.value) {
    unitsPerMetre.value = declared
    scaleFromDrawing.value = true
  }
  ensureTrailingRow()
}

const remove = (index: number) => {
  rows.value.splice(index, 1)
  ensureTrailingRow()
}

const confirm = () => {
  if (!canConfirm.value) return
  const uploads = rows.value.flatMap((row, floorIndex) =>
    row.file ? [{ ...row.file, floorIndex }] : [],
  )
  emit('confirm', uploads, unitsPerMetre.value)
}
</script>

<template>
  <BaseModal
    :open="open"
    size="lg"
    icon="stack"
    :title="t('model.register.plan.title')"
    :subtitle="t('model.register.plan.modalHint')"
    @close="emit('close')"
  >
    <div class="space-y-5">
      <FormField
        v-slot="{ id }"
        :label="t('model.register.plan.scale')"
        :hint="
          scaleFromDrawing
            ? t('model.register.plan.scaleFromDrawing')
            : t('model.register.plan.scaleHint')
        "
      >
        <TextInput
          :id="id"
          v-model="unitsPerMetre"
          type="number"
          min="0.001"
          step="any"
          icon="ruler"
        />
      </FormField>

      <ol class="space-y-2">
        <li
          v-for="(row, index) in rows"
          :key="index"
          class="flex items-center gap-3 rounded-2xl p-3"
          :class="row.file ? 'bg-primary/8' : 'bg-surface-container-low'"
        >
          <span
            class="w-20 shrink-0 text-label-header uppercase"
            :class="row.file ? 'text-primary' : 'text-on-surface-variant'"
          >
            {{ t('model.register.plan.floorRow', { index }) }}
          </span>

          <template v-if="row.file">
            <BaseIcon name="file" class="text-primary" />
            <span class="min-w-0 flex-1 truncate text-body-sm font-semibold">{{
              row.file.name
            }}</span>
            <IconButton
              icon="trash"
              size="sm"
              variant="danger"
              :label="t('model.register.plan.removeFloor')"
              @click="remove(index)"
            />
          </template>
          <input
            v-else
            type="file"
            :accept="ACCEPT"
            class="min-w-0 flex-1 text-body-sm text-on-surface-variant file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-secondary-container file:px-3 file:py-1.5 file:text-body-sm file:font-semibold file:text-on-secondary-container"
            @change="onFile(index, $event)"
          />
        </li>
      </ol>

      <FormMessage v-if="readError">{{ readError }}</FormMessage>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">{{ t('commons.cancel') }}</BaseButton>
      <BaseButton variant="primary" icon="check" :disabled="!canConfirm" @click="confirm">
        {{ t('model.register.plan.confirm', { count: filled.length }) }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

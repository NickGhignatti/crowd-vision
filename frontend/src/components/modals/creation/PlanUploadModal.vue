<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PLAN_EXTENSIONS,
  declaredScaleOf,
  type PlanUpload,
} from '@/utils/building/floorplan/index.ts'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', uploads: PlanUpload[], unitsPerMetre: number): void
}>()

const { t } = useI18n()

/** A row's floor is its position in the list, so removing one renumbers the rest. */
interface Row {
  file: { name: string; bytes: ArrayBuffer } | null
}

const rows = ref<Row[]>([{ file: null }])
const unitsPerMetre = ref(1)
const readError = ref<string | null>(null)
/** True once the scale came from the drawing itself rather than from the default. */
const scaleFromDrawing = ref(false)

const accept = PLAN_EXTENSIONS.map((extension) => `.${extension}`).join(',')

const filled = computed(() => rows.value.filter((row) => row.file))
const canConfirm = computed(() => filled.value.length > 0 && unitsPerMetre.value > 0)

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    rows.value = [{ file: null }]
    unitsPerMetre.value = 1
    scaleFromDrawing.value = false
    readError.value = null
  },
)

const handleRowFile = async (index: number, event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  readError.value = null
  // Bytes, not text: a PDF is binary, and File.text() would corrupt it on the way in.
  let bytes: ArrayBuffer
  try {
    bytes = await file.arrayBuffer()
  } catch {
    readError.value = t('model.register.plan.unreadable')
    return
  }
  rows.value[index]!.file = { name: file.name, bytes }

  // DXF states its own units. Pre-fill from the first drawing that does, and leave the
  // field editable — drawings lie about their units often enough that the knob has to stay.
  const declared = declaredScaleOf(file.name, bytes)
  if (declared !== null && !scaleFromDrawing.value) {
    unitsPerMetre.value = declared
    scaleFromDrawing.value = true
  }

  // Keep exactly one empty row at the end, so the next floor is always one click away.
  if (index === rows.value.length - 1) rows.value.push({ file: null })
}

const removeRow = (index: number) => {
  rows.value.splice(index, 1)
  if (rows.value.length === 0 || rows.value[rows.value.length - 1]!.file) {
    rows.value.push({ file: null })
  }
}

const handleConfirm = () => {
  if (!canConfirm.value) return

  const uploads: PlanUpload[] = []
  rows.value.forEach((row, index) => {
    if (row.file) uploads.push({ ...row.file, floorIndex: index })
  })
  emit('confirm', uploads, unitsPerMetre.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[110] flex items-center justify-center p-4 font-sans"
      >
        <div class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" @click="emit('close')"></div>

        <div
          class="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]"
          @click.stop
        >
          <div class="px-6 py-5 border-b border-slate-100 bg-emerald-50/50 shrink-0">
            <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
              <i class="ph-bold ph-stack text-emerald-600"></i>
              {{ t('model.register.plan.title') }}
            </h3>
            <p class="mt-1 text-xs text-slate-500">{{ t('model.register.plan.modalHint') }}</p>
          </div>

          <div class="overflow-y-auto flex-1 p-6 space-y-5">
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {{ t('model.register.plan.scale') }}
              </label>
              <input
                v-model.number="unitsPerMetre"
                type="number"
                min="0.001"
                step="any"
                class="w-full bg-white border-b-2 border-slate-200 focus:border-emerald-500 outline-none py-1.5 text-slate-800 font-semibold text-sm"
              />
              <p v-if="scaleFromDrawing" class="mt-1 text-xs text-emerald-600 font-semibold">
                {{ t('model.register.plan.scaleFromDrawing') }}
              </p>
              <p v-else class="mt-1 text-xs text-slate-400">
                {{ t('model.register.plan.scaleHint') }}
              </p>
            </div>

            <div class="space-y-2">
              <div
                v-for="(row, index) in rows"
                :key="index"
                class="flex items-center gap-3 rounded-xl border p-3"
                :class="
                  row.file ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'
                "
              >
                <span
                  class="shrink-0 w-20 text-xs font-bold uppercase tracking-wider"
                  :class="row.file ? 'text-emerald-600' : 'text-slate-400'"
                >
                  {{ t('model.register.plan.floorRow', { index }) }}
                </span>

                <span v-if="row.file" class="flex-1 text-sm font-semibold text-slate-700 truncate">
                  {{ row.file.name }}
                </span>
                <input
                  v-else
                  type="file"
                  :accept="accept"
                  class="flex-1 text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-600 hover:file:bg-slate-300"
                  @change="handleRowFile(index, $event)"
                />

                <button
                  v-if="row.file"
                  type="button"
                  class="p-2 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors"
                  :aria-label="t('model.register.plan.removeFloor')"
                  @click="removeRow(index)"
                >
                  <i class="ph-bold ph-trash"></i>
                </button>
              </div>
            </div>

            <p v-if="readError" class="text-xs text-rose-500 font-semibold">{{ readError }}</p>
          </div>

          <div
            class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0"
          >
            <button
              class="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded-xl transition-colors"
              @click="emit('close')"
            >
              {{ t('commons.cancel') }}
            </button>
            <button
              :disabled="!canConfirm"
              class="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-lg shadow-emerald-600/20 rounded-xl transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              @click="handleConfirm"
            >
              <i class="ph-bold ph-check"></i>
              {{ t('model.register.plan.confirm', { count: filled.length }) }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { extractPlans, type PlanUpload } from '@/utils/administration/floorplan/index.ts'
import { useBuildingDraft } from '@/composables/administration/useBuildingDraft.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import FormMessage from '@/components/commons/forms/FormMessage.vue'
import SourcePicker from '@/components/administration/registration/SourcePicker.vue'
import PlanCalibration from '@/components/administration/registration/PlanCalibration.vue'
import BuildingThresholds from '@/components/administration/registration/BuildingThresholds.vue'
import DraftRoomCard from '@/components/administration/registration/DraftRoomCard.vue'
import PlanUploadModal from '@/components/administration/registration/PlanUploadModal.vue'
import BuildingPreviewModal from '@/components/administration/registration/BuildingPreviewModal.vue'

const props = defineProps<{ open: boolean; domainName: string }>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { draft, hasData, isSubmitting, loadFromJson, updateBuilding, updateRoom, clear, submit } =
  useBuildingDraft()

const error = ref<string | null>(null)
// The drawings are kept, so a new scale re-extracts without a second upload.
const planUploads = ref<PlanUpload[]>([])
const unitsPerMetre = ref(1)
const planWarnings = ref<string[]>([])
const dialog = ref<'plans' | 'preview' | null>(null)

const canSave = computed(() => hasData.value && !isSubmitting.value)

const reset = () => {
  error.value = null
  planWarnings.value = []
  planUploads.value = []
  clear()
}

// Room ids come from labels and floor, not order, so edited room settings survive a re-extraction.
const applyPlans = async () => {
  if (planUploads.value.length === 0) return
  error.value = null
  try {
    const { building, warnings } = await extractPlans(planUploads.value, {
      name: draft.value?.name?.trim() || planUploads.value[0]!.name.replace(/\.[^.]+$/, ''),
      unitsPerMetre: unitsPerMetre.value,
    })
    planWarnings.value = warnings
    loadFromJson(building)
  } catch (cause) {
    planWarnings.value = []
    error.value = cause instanceof Error ? cause.message : t('model.register.plan.invalid')
  }
}

watch(unitsPerMetre, (scale) => {
  if (scale > 0) applyPlans()
})

const onPlans = async (uploads: PlanUpload[], scale: number) => {
  dialog.value = null
  reset()
  planUploads.value = uploads
  unitsPerMetre.value = scale
  await applyPlans()
}

const onJson = async (file: File) => {
  reset()
  try {
    loadFromJson(JSON.parse(await file.text()))
  } catch {
    error.value = t('model.register.invalidJson')
  }
}

const close = () => {
  reset()
  emit('close')
}

const save = async () => {
  if (!canSave.value) return
  try {
    await submit(props.domainName)
    close()
  } catch (cause) {
    console.error(cause)
    error.value = t('model.register.saveFailed')
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    size="xl"
    icon="buildings"
    :title="t('model.register.title')"
    :subtitle="domainName"
    @close="close"
  >
    <div class="space-y-6">
      <SourcePicker :disabled="isSubmitting" @json="onJson" @plans="dialog = 'plans'" />

      <FormMessage v-if="error">{{ error }}</FormMessage>

      <PlanCalibration
        v-if="planUploads.length"
        v-model:scale="unitsPerMetre"
        :count="planUploads.length"
        :warnings="planWarnings"
        @change="dialog = 'plans'"
      />

      <template v-if="hasData && draft">
        <div
          class="flex flex-col items-start justify-between gap-3 rounded-2xl bg-primary/8 p-4 sm:flex-row sm:items-center"
        >
          <p class="flex items-center gap-2 text-body-sm text-on-surface">
            <BaseIcon name="info" class="shrink-0 text-primary" />
            {{ t('model.register.preview.explain') }}
          </p>
          <BaseButton size="sm" icon="eye" @click="dialog = 'preview'">
            {{ t('model.register.preview.button') }}
          </BaseButton>
        </div>

        <BuildingThresholds :draft="draft" @update="updateBuilding" />

        <section class="space-y-3">
          <h3 class="flex items-center gap-2 text-label-header uppercase text-on-surface-variant">
            <BaseIcon name="door" />
            {{ t('model.register.rooms') }}
            <span class="rounded-full bg-surface-container px-1.5">{{ draft.rooms.length }}</span>
          </h3>
          <DraftRoomCard
            v-for="room in draft.rooms"
            :key="room.id"
            :room="room"
            @update="updateRoom(room.id, $event)"
          />
        </section>
      </template>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="close">{{ t('commons.cancel') }}</BaseButton>
      <BaseButton
        variant="primary"
        icon="check"
        :disabled="!canSave"
        :loading="isSubmitting"
        @click="save"
      >
        {{ isSubmitting ? t('model.register.saving') : t('commons.save') }}
      </BaseButton>
    </template>
  </BaseModal>

  <PlanUploadModal :open="dialog === 'plans'" @close="dialog = null" @confirm="onPlans" />
  <BuildingPreviewModal
    :open="dialog === 'preview'"
    :rooms="draft?.rooms ?? []"
    @close="dialog = null"
  />
</template>

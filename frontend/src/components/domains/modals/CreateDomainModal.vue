<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DomainToAddWithVisibilityPayload } from '@/interfaces/domain.ts'
import { composeDomainName, isValidDomainName } from '@/utils/domains.ts'
import BaseModal from '@/components/commons/overlays/BaseModal.vue'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import ToggleSwitch from '@/components/commons/base/ToggleSwitch.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import FormField from '@/components/commons/forms/FormField.vue'
import TextInput from '@/components/commons/forms/TextInput.vue'
import SelectInput from '@/components/commons/forms/SelectInput.vue'

const props = defineProps<{ open: boolean; submitting: boolean; parentChoices?: string[] }>()

const emit = defineEmits<{ close: []; create: [payload: DomainToAddWithVisibilityPayload] }>()

const { t } = useI18n()

const blank = () => ({
  name: '',
  parent: props.parentChoices?.[0] ?? '',
  isVisibleFromOutside: false,
})
const form = reactive(blank())
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, blank())
    error.value = null
  },
)

const parentOptions = computed(() => [
  { value: '', label: t('domains.inputs.modal.none') },
  ...(props.parentChoices ?? []).map((name) => ({ value: name, label: `.${name}` })),
])

const fullName = computed(() => composeDomainName(form.name.trim(), form.parent))

const submit = () => {
  if (!isValidDomainName(fullName.value)) {
    error.value = t('domains.modal.errorInvalidMain')
    return
  }
  const parent = form.parent.trim().toLowerCase()
  emit('create', {
    name: fullName.value.toLowerCase(),
    isVisibleFromOutside: form.isVisibleFromOutside,
    ...(parent ? { masterDomain: parent } : {}),
  })
}
</script>

<template>
  <BaseModal
    :open="open"
    icon="globe-hemisphere-west"
    :title="t('domains.inputs.create')"
    :subtitle="t('domains.inputs.modal.desc')"
    @close="emit('close')"
  >
    <form id="create-domain" class="space-y-5" @submit.prevent="submit">
      <FormField
        v-slot="{ id }"
        :label="t('domains.inputs.modal.main')"
        :error="error"
        :hint="fullName ? t('domains.inputs.modal.preview', { name: fullName }) : undefined"
      >
        <div class="flex gap-2">
          <TextInput
            :id="id"
            v-model="form.name"
            icon="globe"
            :invalid="!!error"
            :placeholder="t('domains.inputs.modal.mainPlaceholder')"
            autofocus
          />
          <SelectInput
            v-if="parentChoices?.length"
            v-model="form.parent"
            :options="parentOptions"
            class="w-2/5"
            :aria-label="t('domains.inputs.modal.parent')"
          />
        </div>
      </FormField>

      <div class="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-low p-4">
        <div class="flex items-start gap-3">
          <BaseIcon name="eye" class="mt-0.5 text-lg text-primary" />
          <div>
            <p class="text-body-md font-semibold">{{ t('domains.inputs.visibleFromOutside') }}</p>
            <p class="text-body-sm text-on-surface-variant">
              {{ t('domains.inputs.visibleFromOutsideDesc') }}
            </p>
          </div>
        </div>
        <ToggleSwitch
          v-model="form.isVisibleFromOutside"
          :label="t('domains.inputs.visibleFromOutside')"
        />
      </div>
    </form>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">{{ t('commons.cancel') }}</BaseButton>
      <BaseButton type="submit" form="create-domain" variant="primary" :loading="submitting">
        {{ t('commons.create') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuthDialog, type AuthDialog } from '@/composables/ui/useAuthDialog.ts'
import BaseButton from '@/components/commons/base/BaseButton.vue'

defineProps<{ stacked?: boolean }>()

const emit = defineEmits<{ select: [] }>()

const { t } = useI18n()
const dialog = useAuthDialog()

const open = (kind: AuthDialog) => {
  dialog.open(kind)
  emit('select')
}
</script>

<template>
  <div :class="stacked ? 'grid grid-cols-2 gap-2' : 'flex items-center gap-2'">
    <BaseButton variant="ghost" :block="stacked" @click="open('login')">
      {{ t('authentication.login') }}
    </BaseButton>
    <BaseButton variant="primary" :block="stacked" @click="open('signup')">
      {{ t('authentication.getStarted') }}
    </BaseButton>
  </div>
</template>

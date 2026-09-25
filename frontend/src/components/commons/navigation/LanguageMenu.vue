<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PopoverMenu from '@/components/commons/overlays/PopoverMenu.vue'
import MenuItem from '@/components/commons/overlays/MenuItem.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

const { t, locale } = useI18n()

const LANGUAGES = [
  { code: 'en', key: 'commons.languageSelector.english' },
  { code: 'it', key: 'commons.languageSelector.italian' },
]

const select = (code: string, close: () => void) => {
  locale.value = code
  try {
    localStorage.setItem('locale', code)
  } catch {
    // Private mode: the choice still holds for this tab.
  }
  close()
}
</script>

<template>
  <PopoverMenu width="w-40">
    <template #trigger="{ toggle, open }">
      <button
        type="button"
        class="flex h-9 items-center gap-1 rounded-lg px-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
        :title="t('commons.languageSelector.changeLanguage')"
        :aria-label="t('commons.languageSelector.changeLanguage')"
        :aria-expanded="open"
        @click="toggle"
      >
        <BaseIcon name="globe" class="text-lg" />
        <span class="hidden text-label-stat font-semibold uppercase sm:inline">{{ locale }}</span>
      </button>
    </template>

    <template #default="{ close }">
      <MenuItem
        v-for="language in LANGUAGES"
        :key="language.code"
        :checked="locale === language.code"
        @select="select(language.code, close)"
      >
        {{ t(language.key) }}
      </MenuItem>
    </template>
  </PopoverMenu>
</template>

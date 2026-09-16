<script setup lang="ts">
import { useAuth } from '@/composables/auth/useAuth.ts'
import { useAuthDialog } from '@/composables/ui/useAuthDialog.ts'
import { useNavLinks } from '@/composables/ui/useNavLinks.ts'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'

withDefaults(defineProps<{ vertical?: boolean }>(), { vertical: false })

const emit = defineEmits<{ navigate: [] }>()

const { isLoggedIn } = useAuth()
const { links } = useNavLinks()
const dialog = useAuthDialog()

const openLogin = () => {
  dialog.open('login')
  emit('navigate')
}

const linkClass = (vertical: boolean, active: boolean) =>
  vertical
    ? [
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-md transition-colors',
        active
          ? 'bg-secondary-container font-semibold text-on-secondary-container'
          : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
      ]
    : [
        'relative flex h-16 items-center gap-1.5 text-body-md transition-colors',
        'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
        active
          ? 'font-semibold text-primary after:bg-primary'
          : 'font-medium text-on-surface-variant after:bg-transparent hover:text-primary',
      ]
</script>

<template>
  <nav :class="vertical ? 'flex flex-col gap-1' : 'flex items-center gap-8'">
    <template v-for="link in links" :key="link.to">
      <RouterLink v-if="isLoggedIn" v-slot="{ href, navigate, isActive }" :to="link.to" custom>
        <a
          :href="href"
          :class="linkClass(vertical, isActive)"
          :aria-current="isActive ? 'page' : undefined"
          @click="(navigate($event), emit('navigate'))"
        >
          <BaseIcon v-if="vertical" :name="link.icon" class="text-lg" />
          {{ link.label() }}
        </a>
      </RouterLink>
      <button v-else type="button" :class="linkClass(vertical, false)" @click="openLogin">
        <BaseIcon name="lock-key" class="text-base" />
        {{ link.label() }}
      </button>
    </template>
  </nav>
</template>

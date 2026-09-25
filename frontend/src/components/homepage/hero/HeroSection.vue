<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/authentication/useAuth.ts'
import { useAuthDialog } from '@/composables/authentication/useAuthDialog.ts'
import { ROUTES } from '@/router/routes.ts'
import BaseButton from '@/components/commons/base/BaseButton.vue'
import BaseIcon from '@/components/commons/base/BaseIcon.vue'
import LiveIndicator from '@/components/commons/base/LiveIndicator.vue'
import blueprint from '@/assets/background.png'

const DOCS_URL = 'https://nickghignatti.github.io/crowd-vision/'

const HIGHLIGHTS = [
  { icon: 'thermometer', key: 'model.rooms.temperature' },
  { icon: 'users-three', key: 'model.rooms.occupancy' },
  { icon: 'wind', key: 'dashboard.table.headers.indoorAqi' },
]

const { t } = useI18n()
const { isLoggedIn } = useAuth()
const dialog = useAuthDialog()
</script>

<template>
  <section class="relative overflow-hidden">
    <div
      class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_20%_10%,var(--cv-secondary-container),transparent),radial-gradient(40%_40%_at_90%_30%,var(--cv-tertiary-container),transparent)] opacity-60"
    />

    <div
      class="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 md:px-margin lg:grid-cols-2 lg:pt-24"
    >
      <div class="space-y-6 text-center lg:text-left">
        <LiveIndicator active :label="t('home.title.monitoring')" />

        <h1 class="text-4xl font-bold tracking-tight text-on-surface md:text-6xl">
          {{ t('home.title.insights') }}
          <span
            class="block bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
          >
            {{ t('home.title.spaces') }}
          </span>
        </h1>

        <p class="mx-auto max-w-xl text-title-sm font-normal text-on-surface-variant lg:mx-0">
          {{ t('home.subTitle.biography') }}
        </p>

        <div class="flex flex-wrap justify-center gap-3 lg:justify-start">
          <BaseButton
            v-if="isLoggedIn"
            variant="primary"
            size="lg"
            icon-right="arrow-right"
            :to="ROUTES.dashboard"
          >
            {{ t('home.cta.openDashboard') }}
          </BaseButton>
          <BaseButton
            v-else
            variant="primary"
            size="lg"
            icon-right="arrow-right"
            @click="dialog.open('signup')"
          >
            {{ t('authentication.getStarted') }}
          </BaseButton>
          <BaseButton size="lg" icon="book-open-text" :href="DOCS_URL">
            {{ t('home.subTitle.documentation') }}
          </BaseButton>
        </div>
      </div>

      <div class="relative mx-auto w-full max-w-xl">
        <div class="surface-card overflow-hidden rounded-3xl p-2 shadow-lift">
          <img
            :src="blueprint"
            :alt="t('home.heroImageAlt')"
            class="aspect-[4/3] w-full rounded-lg bg-surface-container-low object-cover mix-blend-multiply dark:opacity-80 dark:mix-blend-screen dark:invert"
          />
        </div>
        <ul class="absolute -bottom-5 left-1/2 hidden -translate-x-1/2 gap-2 sm:flex">
          <li
            v-for="item in HIGHLIGHTS"
            :key="item.icon"
            class="surface-card flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-label-stat font-semibold rounded-full shadow-lift"
          >
            <BaseIcon :name="item.icon" class="text-base text-primary" />
            {{ t(item.key) }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/commons/layout/AppLayout.vue'
import HeroSection from '@/components/homepage/hero/HeroSection.vue'
import FeatureCarousel from '@/components/homepage/features/FeatureCarousel.vue'
import HomeFooter from '@/components/homepage/layout/HomeFooter.vue'

const { t } = useI18n()
</script>

<template>
  <AppLayout variant="bare">
    <HeroSection />

    <section class="bg-surface-container-lowest py-20" aria-labelledby="features-title">
      <div class="mx-auto max-w-7xl space-y-10 px-4 md:px-margin">
        <header class="mx-auto max-w-2xl space-y-3 text-center">
          <h2 id="features-title" class="text-headline-lg text-on-surface">
            {{ t('home.features.why') }}
          </h2>
          <p class="text-body-md text-on-surface-variant">{{ t('home.features.motivation') }}</p>
        </header>
        <FeatureCarousel />
      </div>
    </section>

    <template #footer>
      <HomeFooter />
    </template>
  </AppLayout>
</template>

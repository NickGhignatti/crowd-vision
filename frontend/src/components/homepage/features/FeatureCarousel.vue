<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { slotOf, type CarouselSlot } from '@/utils/homepage/carousel.ts'
import { useCarousel } from '@/composables/homepage/useCarousel.ts'
import FeatureCard from '@/components/homepage/features/FeatureCard.vue'
import IconButton from '@/components/commons/base/IconButton.vue'

const FEATURES = [
  { icon: 'cube', key: 'feature1' },
  { icon: 'chart-line-up', key: 'feature2' },
  { icon: 'robot', key: 'feature3' },
  { icon: 'bell-ringing', key: 'feature4' },
  { icon: 'shield-check', key: 'feature5' },
]

const SLOT_CLASS: Record<CarouselSlot, string> = {
  current: 'z-20 scale-100 opacity-100 shadow-lift md:scale-105',
  next: 'z-10 scale-90 opacity-0 md:translate-x-[105%] md:opacity-50 md:hover:opacity-90 cursor-pointer',
  previous:
    'z-10 scale-90 opacity-0 md:-translate-x-[105%] md:opacity-50 md:hover:opacity-90 cursor-pointer',
  hidden: 'z-0 scale-75 opacity-0 pointer-events-none',
}

const { t } = useI18n()
const { current, next, previous, pause, resume } = useCarousel(FEATURES.length)

const select = (slot: CarouselSlot) => {
  if (slot === 'next') next()
  if (slot === 'previous') previous()
}
</script>

<template>
  <div class="space-y-6" @mouseenter="pause" @mouseleave="resume">
    <div class="relative flex h-[340px] items-center justify-center">
      <FeatureCard
        v-for="(feature, index) in FEATURES"
        :key="feature.key"
        :icon="feature.icon"
        :title="t(`home.features.${feature.key}.title`)"
        :description="t(`home.features.${feature.key}.description`)"
        class="absolute transition-all duration-700 ease-in-out"
        :class="SLOT_CLASS[slotOf(index, current, FEATURES.length)]"
        :aria-hidden="index !== current"
        @click="select(slotOf(index, current, FEATURES.length))"
      />
    </div>

    <div class="flex items-center justify-center gap-4">
      <IconButton
        icon="caret-left"
        variant="outlined"
        :label="t('commons.previous')"
        @click="previous"
      />
      <div class="flex gap-1.5" aria-hidden="true">
        <span
          v-for="(feature, index) in FEATURES"
          :key="feature.key"
          class="h-1.5 rounded-full transition-all"
          :class="index === current ? 'w-6 bg-primary' : 'w-1.5 bg-outline-variant'"
        />
      </div>
      <IconButton icon="caret-right" variant="outlined" :label="t('commons.next')" @click="next" />
    </div>
  </div>
</template>

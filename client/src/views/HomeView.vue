<script setup lang="ts">
import NavBar from '@/components/layouts/NavBar.vue'
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Data for our 5 feature cards
const features = [
  {
    id: 1,
    icon: 'ph-cube',
    titleKey: 'home.features.feature1.title',
    descKey: 'home.features.feature1.description',
  },
  {
    id: 2,
    icon: 'ph-chart-line-up',
    titleKey: 'home.features.feature2.title',
    descKey: 'home.features.feature2.description',
  },
  {
    id: 3,
    icon: 'ph-robot',
    titleKey: 'home.features.feature3.title',
    descKey: 'home.features.feature3.description',
  },
  {
    id: 4,
    icon: 'ph-bell-ringing',
    titleKey: 'home.features.feature4.title',
    descKey: 'home.features.feature4.description',
  },
  {
    id: 5,
    icon: 'ph-shield-check',
    titleKey: 'home.features.feature5.title',
    descKey: 'home.features.feature5.description',
  },
]

const currentIndex = ref(0)
let autoplayTimer: ReturnType<typeof setInterval> | null = null

const nextFeature = () => {
  currentIndex.value = (currentIndex.value + 1) % features.length
}

const prevFeature = () => {
  currentIndex.value = (currentIndex.value - 1 + features.length) % features.length
}

const goToFeature = (index: number) => {
  const diff = (index - currentIndex.value + features.length) % features.length
  if (diff === 1) nextFeature()
  if (diff === features.length - 1) prevFeature()
}

const handleNext = () => {
  nextFeature()
  stopAutoplay()
  startAutoplay()
}

const handlePrev = () => {
  prevFeature()
  stopAutoplay()
  startAutoplay()
}

const startAutoplay = () => {
  if (!autoplayTimer) autoplayTimer = setInterval(nextFeature, 4000)
}

const stopAutoplay = () => {
  if (autoplayTimer) {
    clearInterval(autoplayTimer)
    autoplayTimer = null
  }
}

onMounted(() => {
  startAutoplay()
})

onUnmounted(() => {
  stopAutoplay()
})

const getCardClass = (index: number) => {
  const diff = (index - currentIndex.value + features.length) % features.length

  if (diff === 0) {
    return 'scale-100 md:scale-110 z-20 opacity-100 shadow-xl border-emerald-300 bg-white'
  }
  if (diff === 1) {
    return 'scale-90 z-10 opacity-0 md:opacity-60 translate-x-0 md:translate-x-[105%] hover:opacity-100 cursor-pointer pointer-events-none md:pointer-events-auto bg-slate-50/90 backdrop-blur-sm'
  }
  if (diff === features.length - 1) {
    return 'scale-90 z-10 opacity-0 md:opacity-60 translate-x-0 md:-translate-x-[105%] hover:opacity-100 cursor-pointer pointer-events-none md:pointer-events-auto bg-slate-50/90 backdrop-blur-sm'
  }

  return 'scale-75 z-0 opacity-0 pointer-events-none translate-x-0'
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 selection:bg-emerald-100 selection:text-emerald-900">
    <NavBar />

    <section class="relative pt-20 pb-32 overflow-hidden">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <div
          class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold uppercase tracking-wide mb-6"
        >
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          {{ t('home.title.monitoring') }}
        </div>

        <h1 class="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6">
          {{ t('home.title.insights') }} <br class="hidden md:block" />
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
            {{ t('home.title.spaces') }}
          </span>
        </h1>

        <p class="mt-4 max-w-2xl mx-auto text-xl text-slate-600">
          {{ t('home.subTitle.biography') }}
        </p>

        <div class="mt-10 flex justify-center gap-4">
          <a
            class="px-8 py-3.5 rounded-xl bg-white text-slate-700 font-bold border border-slate-200 hover:border-slate-300 shadow-sm transition-all hover:bg-slate-50"
            href="https://nickghignatti.github.io/crowd-vision/"
          >
            {{ t('home.subTitle.documentation') }}
          </a>
        </div>
      </div>

      <div
        class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full z-0 overflow-hidden pointer-events-none"
      >
        <div
          class="absolute top-[20%] left-[10%] w-72 h-72 bg-emerald-200/20 rounded-full blur-3xl"
        ></div>
        <div
          class="absolute top-[30%] right-[10%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
        ></div>
      </div>
    </section>

    <section
      id="features"
      class="py-24 bg-white border-y border-slate-200 relative overflow-hidden"
    >
      <div
        class="absolute inset-0 w-full h-full z-0 pointer-events-none opacity-15 select-none"
        style="
          mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
        "
      >
        <img
          src="@/assets/background.png"
          alt="3D Building Blueprint"
          class="w-full h-full object-cover object-center mix-blend-multiply"
        />
      </div>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-slate-900">{{ t('home.features.why') }}</h2>
          <p class="mt-4 text-slate-500">
            {{ t('home.features.motivation') }}
          </p>
        </div>

        <div
          class="relative w-full max-w-5xl mx-auto h-[350px] md:h-[400px] flex justify-center items-center"
          @mouseenter="stopAutoplay"
          @mouseleave="startAutoplay"
        >
          <div
            v-for="(feature, index) in features"
            :key="feature.id"
            @click="goToFeature(index)"
            class="absolute transition-all duration-700 ease-in-out p-8 rounded-2xl border border-slate-100 w-[90%] md:w-[340px] group"
            :class="getCardClass(index)"
          >
            <div
              class="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform duration-300"
            >
              <i :class="['ph-bold text-2xl', feature.icon]"></i>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">
              {{ t(feature.titleKey) }}
            </h3>
            <p class="text-slate-600 leading-relaxed">
              {{ t(feature.descKey) }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <footer class="bg-slate-50 py-12 border-t border-slate-200 relative z-10">
      <div class="max-w-7xl mx-auto px-4 text-center">
        <p class="text-slate-400 text-sm">
          © {{ new Date().getFullYear() }} {{ t('commons.app.rights') }}
        </p>
      </div>
    </footer>
  </div>
</template>

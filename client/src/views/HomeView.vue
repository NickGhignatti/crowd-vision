<script setup lang="ts">
import NavBar from '@/components/NavBar.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
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
          {{ t('home.monitoring') }}
        </div>

        <h1 class="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6">
          {{ t('home.utils.insights') }} <br class="hidden md:block" />
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
            {{ t('home.utils.spaces') }}
          </span>
        </h1>

        <p class="mt-4 max-w-2xl mx-auto text-xl text-slate-600">
          {{ t('home.bio') }}
        </p>

        <div class="mt-10 flex justify-center gap-4">
          <a
            class="px-8 py-3.5 rounded-xl bg-white text-slate-700 font-bold border border-slate-200 hover:border-slate-300 shadow-sm transition-all hover:bg-slate-50"
            href="https://nickghignatti.github.io/crowd-vision/"
          >
            {{ t('home.doc') }}
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

    <section id="features" class="py-24 bg-white border-y border-slate-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-slate-900">{{ t('home.features.why') }}</h2>
          <p class="mt-4 text-slate-500">
            {{ t('home.features.built') }}
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <div
            class="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors group"
          >
            <div
              class="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform"
            >
              <i class="ph-bold ph-users-three text-2xl"></i>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">{{ t('home.features.f1.title') }}</h3>
            <p class="text-slate-600 leading-relaxed">
              {{ t('home.features.f1.description') }}
            </p>
          </div>

          <div
            class="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors group"
          >
            <div
              class="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform"
            >
              <i class="ph-bold ph-chart-bar text-2xl"></i>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">{{ t('home.features.f2.title') }}</h3>
            <p class="text-slate-600 leading-relaxed">
              {{ t('home.features.f2.description') }}
            </p>
          </div>

          <div
            class="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors group"
          >
            <div
              class="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform"
            >
              <i class="ph-bold ph-shield-check text-2xl"></i>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">{{ t('home.features.f3.title') }}</h3>
            <p class="text-slate-600 leading-relaxed">{{ t('home.features.f3.description') }}</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="bg-slate-50 py-12 border-t border-slate-200">
      <div class="max-w-7xl mx-auto px-4 text-center">
        <p class="text-slate-400 text-sm">
          © {{ new Date().getFullYear() }} CrowdVision Systems. All rights reserved.
        </p>
      </div>
    </footer>
  </div>
</template>

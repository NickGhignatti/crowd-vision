<template>
  <div class="min-h-screen bg-slate-50 selection:bg-emerald-100 selection:text-emerald-900">
    <NavBar />

    <section class="relative pt-20 pb-32 overflow-hidden">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">

        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold uppercase tracking-wide mb-6">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Monitoring v2.0
        </div>

        <h1 class="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6">
          Smart insights for <br class="hidden md:block" />
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
            safer spaces.
          </span>
        </h1>

        <p class="mt-4 max-w-2xl mx-auto text-xl text-slate-600">
          CrowdVision provides real-time occupancy tracking and flow analysis for educational institutions. Make data-driven decisions without the clutter.
        </p>

        <div class="mt-10 flex justify-center gap-4">
          <router-link to="/dashboard" class="px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-1">
            Launch Dashboard
          </router-link>
          <button class="px-8 py-3.5 rounded-xl bg-white text-slate-700 font-bold border border-slate-200 hover:border-slate-300 shadow-sm transition-all hover:bg-slate-50">
            View Documentation
          </button>
        </div>
      </div>

      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full z-0 overflow-hidden pointer-events-none">
        <div class="absolute top-[20%] left-[10%] w-72 h-72 bg-emerald-200/20 rounded-full blur-3xl"></div>
        <div class="absolute top-[30%] right-[10%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"></div>
      </div>
    </section>

    <section id="features" class="py-24 bg-white border-y border-slate-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-slate-900">Why CrowdVision?</h2>
          <p class="mt-4 text-slate-500">Built for administrators who need clarity, not complexity.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <div class="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors group">
            <div class="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
              <i class="ph-bold ph-users-three text-2xl"></i>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Real-time Counting</h3>
            <p class="text-slate-600 leading-relaxed">
              Monitor student density across multiple rooms instantly. Visual indicators update via our optimized 3D engine.
            </p>
          </div>

          <div class="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors group">
            <div class="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
              <i class="ph-bold ph-chart-bar text-2xl"></i>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Capacity Alerts</h3>
            <p class="text-slate-600 leading-relaxed">
              Set thresholds for specific zones. Receive visual cues when hallways or classrooms exceed safe capacity limits.
            </p>
          </div>

          <div class="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors group">
            <div class="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
              <i class="ph-bold ph-shield-check text-2xl"></i>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Privacy First</h3>
            <p class="text-slate-600 leading-relaxed">
              We analyze movement data without storing biometric information. Compliant with standard safety regulations.
            </p>
          </div>
        </div>
      </div>
    </section>

    <footer class="bg-slate-50 py-12 border-t border-slate-200">
      <div class="max-w-7xl mx-auto px-4 text-center">
        <p class="text-slate-400 text-sm">© {{ new Date().getFullYear() }} CrowdVision Systems. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import NavBar from '../components/NavBar.vue';
</script>

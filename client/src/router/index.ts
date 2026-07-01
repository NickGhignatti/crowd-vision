import HomeView from '@/views/HomeView.vue'
import ModelView from '@/views/ModelView.vue'
import DomainsView from '@/views/DomainsView.vue'
import DashboardView from '@/views/DashboardView.vue'
import AdministrationView from '@/views/AdministrationView.vue'

import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authentication.ts'

const router = createRouter({
  history: import.meta.env.TEST
    ? createMemoryHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/dashboards',
      name: 'dashboard',
      component: DashboardView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/model',
      name: 'model',
      component: ModelView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/domains',
      name: 'domains',
      component: DomainsView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/admin-panel',
      name: 'Administration Tools',
      component: AdministrationView,
      meta: {
        requiresAuth: true,
      },
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  // Wait for hydration before making any auth decision
  // This prevents the router from redirecting on refresh before /me has responded
  if (!authStore.isHydrated) {
    await authStore.hydrate()
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return '/'
  }
})

export default router

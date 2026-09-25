import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authentication/authentication.ts'
import { ROUTES } from '@/router/routes.ts'
import HomeView from '@/views/homepage/HomeView.vue'

// The homepage is the landing page, so it ships in the entry chunk; every other view loads on demand.
const router = createRouter({
  history: import.meta.env.TEST
    ? createMemoryHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: ROUTES.home, name: 'home', component: HomeView },
    {
      path: ROUTES.dashboard,
      name: 'dashboard',
      component: () => import('@/views/dashboard/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: ROUTES.digitalTwin,
      name: 'digital-twin',
      component: () => import('@/views/digital-twin/DigitalTwinView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: ROUTES.domains,
      name: 'domains',
      component: () => import('@/views/domains/DomainsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: ROUTES.administration,
      name: 'administration',
      component: () => import('@/views/administration/AdministrationView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: ROUTES.authCallback,
      name: 'auth-callback',
      component: () => import('@/views/authentication/AuthCallbackView.vue'),
    },
    {
      path: ROUTES.webGpuSmoke,
      name: 'webgpu-smoke',
      component: () => import('@/views/digital-twin/WebGpuSmokeView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: ROUTES.home },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  // Wait for /me, or a refresh would redirect before the session is known.
  if (!authStore.isHydrated) await authStore.hydrate()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) return ROUTES.home
})

export default router

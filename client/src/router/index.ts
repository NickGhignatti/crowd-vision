import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import DashboardView from '@/views/DashboardView.vue'
import ModelView from '@/views/ModelView.vue'
import DomainsView from '@/views/DomainsView.vue'

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
      path: '/dashboard',
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
  ],
})

router.beforeEach((to, from, next) => {
  const isAuthenticated =
    typeof localStorage !== 'undefined' && localStorage.getItem('isAuthenticated') === 'true'

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/')
  } else {
    next()
  }
})

export default router

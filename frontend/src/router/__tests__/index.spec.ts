import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the routed views so importing the router doesn't pull in the heavy 3D stack.
vi.mock('@/views/HomeView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/ModelView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/DomainsView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/DashboardView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/AdministrationView.vue', () => ({ default: { template: '<div />' } }))

const authState = {
  isAuthenticated: false,
  isHydrated: false,
  hydrate: vi.fn(),
}

vi.mock('@/stores/authentication.ts', () => ({
  useAuthStore: () => authState,
}))

import router from '@/router'

describe('router auth guard', () => {
  beforeEach(async () => {
    authState.isAuthenticated = false
    authState.isHydrated = true
    authState.hydrate = vi.fn().mockResolvedValue(undefined)
    await router.replace('/')
    await router.isReady()
  })

  it('allows navigation to a public route', async () => {
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('redirects to "/" when an auth route is hit while unauthenticated', async () => {
    await router.push('/dashboards')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('allows an auth route when authenticated', async () => {
    authState.isAuthenticated = true
    await router.push('/dashboards')
    expect(router.currentRoute.value.path).toBe('/dashboards')
  })

  it('hydrates before deciding when not yet hydrated', async () => {
    authState.isHydrated = false
    await router.push('/model')
    expect(authState.hydrate).toHaveBeenCalled()
  })
})

/** Every app path in one place, so links and guards never disagree with the router. */
export const ROUTES = {
  home: '/',
  dashboard: '/dashboards',
  digitalTwin: '/model',
  domains: '/domains',
  administration: '/admin-panel',
  authCallback: '/auth/callback',
  webGpuSmoke: '/_webgpu-smoke',
} as const

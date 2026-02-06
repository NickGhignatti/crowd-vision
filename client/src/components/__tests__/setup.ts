import { vi } from 'vitest'
import { config } from '@vue/test-utils'

config.global.stubs = {
  RouterLink: {
    template: '<a><slot /></a>',
  },
  RouterView: true,
}

// Mock LocalStorage (JSDOM has it, but sometimes it needs a reset)
const localStorageMock = (function () {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    clear: () => {
      store = {}
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock Fetch
global.fetch = vi.fn()

// Mock vue-i18n globally
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: { value: 'en' },
  }),
}))

// Mock Vue Router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  RouterLink: {
    template: '<a><slot /></a>',
  },
}))

// Mock ScrollIntoView (for RightMenu)
Element.prototype.scrollIntoView = vi.fn()

// Mock ResizeObserver (common in UI libs)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import { vi } from 'vitest'
import { config } from '@vue/test-utils'

config.global.stubs = {
  RouterLink: {
    template: '<a><slot /></a>',
  },
  RouterView: true,
}

// Mock LocalStorage
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
  createI18n: () => ({
    global: {
      t: (key: string) => key,
      locale: { value: 'en' },
    },
  }),
  useI18n: () => ({
    t: (key: string) => key,
    locale: { value: 'en' },
  }),
}))

// Mock socket.io-client (Prevents hanging tests)
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    off: vi.fn(),
    connected: false,
  }),
}))

// Mock ScrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

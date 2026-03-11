import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FullScreenMode from '../FullScreenMode.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'dashboard.mode.focusMode': 'Focus Mode',
      }
      return translations[key] ?? key
    },
  }),
}))

describe('FullScreenMode', () => {
  describe('Rendering', () => {
    it('renders the button when not in fullscreen', () => {
      const wrapper = mount(FullScreenMode, {
        props: { isFullscreen: false },
      })

      expect(wrapper.find('button').exists()).toBe(true)
    })

    it('does not render the button when in fullscreen', () => {
      const wrapper = mount(FullScreenMode, {
        props: { isFullscreen: true },
      })

      expect(wrapper.find('button').exists()).toBe(false)
    })

    it('renders the label text', () => {
      const wrapper = mount(FullScreenMode, {
        props: { isFullscreen: false },
      })

      expect(wrapper.text()).toContain('Focus Mode')
    })

    it('renders the SVG icon', () => {
      const wrapper = mount(FullScreenMode, {
        props: { isFullscreen: false },
      })

      expect(wrapper.find('svg').exists()).toBe(true)
    })
  })

  describe('Emits', () => {
    it('emits toggleFocusMode when clicked', async () => {
      const wrapper = mount(FullScreenMode, {
        props: { isFullscreen: false },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('toggleFocusMode')).toHaveLength(1)
    })

    it('does not emit anything when rendered in fullscreen', () => {
      const wrapper = mount(FullScreenMode, {
        props: { isFullscreen: true },
      })

      // Button doesn't exist so nothing can be emitted
      expect(wrapper.find('button').exists()).toBe(false)
      expect(wrapper.emitted('toggleFocusMode')).toBeUndefined()
    })
  })
})

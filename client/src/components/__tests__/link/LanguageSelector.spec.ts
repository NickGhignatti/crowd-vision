import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguageSelector from '@/components/buttons/LanguageSelector.vue'
import type { Ref } from 'vue'

const mocks = vi.hoisted(() => ({
  locale: {} as Ref<string>,
}))

vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  mocks.locale = ref('en')
  return {
    useI18n: () => ({
      locale: mocks.locale,
    }),
  }
})

describe('LanguageSelector.vue', () => {
  beforeEach(() => {
    if (mocks.locale) {
      mocks.locale.value = 'en'
    }
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders with dropdown closed by default', () => {
    const wrapper = mount(LanguageSelector)
    expect(wrapper.find('button[title="Change Language"]').exists()).toBe(true)
    expect(wrapper.find('button[class*="text-left"]').exists()).toBe(false)
  })

  it('opens dropdown when toggle button is clicked', async () => {
    const wrapper = mount(LanguageSelector)

    await wrapper.find('button[title="Change Language"]').trigger('click')

    expect(wrapper.find('button[class*="text-left"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('English')
    expect(wrapper.text()).toContain('Italiano')
  })

  it('switches language to Italian and updates localStorage', async () => {
    const wrapper = mount(LanguageSelector)

    await wrapper.find('button[title="Change Language"]').trigger('click')

    const italianBtn = wrapper.findAll('button').find((b) => b.text() === 'Italiano')
    await italianBtn?.trigger('click')

    expect(mocks.locale.value).toBe('it')
    expect(localStorage.getItem('locale')).toBe('it')
  })

  it('highlights the active language', async () => {
    mocks.locale.value = 'it'

    const wrapper = mount(LanguageSelector)

    await wrapper.find('button[title="Change Language"]').trigger('click')

    const enBtn = wrapper.findAll('button').find((b) => b.text() === 'English')
    const itBtn = wrapper.findAll('button').find((b) => b.text() === 'Italiano')

    expect(enBtn?.classes()).not.toContain('text-emerald-600')
    expect(itBtn?.classes()).toContain('text-emerald-600')
  })
})

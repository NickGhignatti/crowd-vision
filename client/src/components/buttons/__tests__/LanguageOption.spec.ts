import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LangOption from '../LanguageOption.vue'

describe('LangOption', () => {
  it('renders the label', () => {
    const wrapper = mount(LangOption, {
      props: { label: 'English', isActive: false },
    })

    expect(wrapper.text()).toBe('English')
  })

  it('applies active styles when isActive is true', () => {
    const wrapper = mount(LangOption, {
      props: { label: 'English', isActive: true },
    })

    expect(wrapper.classes()).toContain('text-emerald-600')
    expect(wrapper.classes()).toContain('font-bold')
  })

  it('applies inactive styles when isActive is false', () => {
    const wrapper = mount(LangOption, {
      props: { label: 'English', isActive: false },
    })

    expect(wrapper.classes()).toContain('text-slate-600')
  })

  it('emits select when clicked', async () => {
    const wrapper = mount(LangOption, {
      props: { label: 'English', isActive: false },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ControlButton from '@/components/buttons/ControlButton.vue'

describe('ControlButton.vue', () => {
  const defaultProps = {
    icon: 'ph-gear',
  }

  it('renders the correct icon class', () => {
    const wrapper = mount(ControlButton, {
      props: defaultProps,
    })

    // Check if the <i> tag has the icon class passed in props
    const icon = wrapper.find('i')
    expect(icon.classes()).toContain('ph-gear')
    expect(icon.classes()).toContain('ph-bold') // inherited from template
  })

  it('emits click event when clicked', async () => {
    const wrapper = mount(ControlButton, {
      props: defaultProps,
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toBeTruthy()
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('renders title attribute when provided', () => {
    const wrapper = mount(ControlButton, {
      props: {
        ...defaultProps,
        title: 'Settings',
      },
    })

    expect(wrapper.attributes('title')).toBe('Settings')
  })

  describe('Styling States', () => {
    it('applies default styles when inactive', () => {
      const wrapper = mount(ControlButton, {
        props: { ...defaultProps, active: false },
      })

      expect(wrapper.classes()).toContain('text-slate-500')
      expect(wrapper.classes()).not.toContain('text-emerald-600')
    })

    it('applies active styles when active prop is true', () => {
      const wrapper = mount(ControlButton, {
        props: { ...defaultProps, active: true },
      })

      expect(wrapper.classes()).toContain('text-emerald-600')
      expect(wrapper.classes()).not.toContain('text-slate-500')
    })

    it('applies disabled styles and attribute', async () => {
      const wrapper = mount(ControlButton, {
        props: { ...defaultProps, disabled: true },
      })

      expect(wrapper.classes()).toContain('text-slate-300')
      expect(wrapper.classes()).toContain('cursor-not-allowed')

      expect(wrapper.element.hasAttribute('disabled')).toBe(true)
    })
  })
})

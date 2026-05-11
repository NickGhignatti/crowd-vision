import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToggleSwitch from '../ToggleSwitch.vue'

describe('ToggleSwitch.vue', () => {
  it('renders correctly with default state (off)', () => {
    const wrapper = mount(ToggleSwitch, {
      props: {
        modelValue: false
      }
    })

    expect(wrapper.attributes('role')).toBe('switch')
    expect(wrapper.attributes('aria-checked')).toBe('false')
    expect(wrapper.classes()).toContain('bg-slate-300')

    const span = wrapper.find('span')
    expect(span.classes()).toContain('translate-x-0')
  })

  it('renders correctly when state is on', () => {
    const wrapper = mount(ToggleSwitch, {
      props: {
        modelValue: true
      }
    })

    expect(wrapper.attributes('aria-checked')).toBe('true')
    expect(wrapper.classes()).toContain('bg-emerald-600')

    const span = wrapper.find('span')
    expect(span.classes()).toContain('translate-x-5')
  })

  it('emits update:modelValue when clicked', async () => {
    const wrapper = mount(ToggleSwitch, {
      props: {
        modelValue: false
      }
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([true])
  })

  it('toggles value when clicked multiple times', async () => {
    const wrapper = mount(ToggleSwitch, {
      props: {
        modelValue: false
      }
    })

    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([true])

    await wrapper.setProps({ modelValue: true })

    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')![1]).toEqual([false])
  })

  it('handles undefined model state', () => {
    const wrapper = mount(ToggleSwitch)

    expect(wrapper.attributes('aria-checked')).toBe('false')
    expect(wrapper.classes()).toContain('bg-slate-300')
  })
})

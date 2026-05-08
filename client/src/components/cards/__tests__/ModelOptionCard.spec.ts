import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ModelOptionCard from '../ModelOptionCard.vue'

describe('ModelOptionCard.vue', () => {
  const label = 'Test Model'

  it('renders the label correctly', () => {
    const wrapper = mount(ModelOptionCard, {
      props: { label }
    })
    expect(wrapper.text()).toContain(label)
  })

  it('applies unselected classes when isSelected is false', () => {
    const wrapper = mount(ModelOptionCard, {
      props: { label, isSelected: false }
    })
    const button = wrapper.find('button')
    expect(button.classes()).toContain('text-slate-600')
    expect(button.classes()).not.toContain('bg-emerald-50')
    expect(wrapper.find('i').exists()).toBe(false)
  })

  it('applies selected classes and shows icon when isSelected is true', () => {
    const wrapper = mount(ModelOptionCard, {
      props: { label, isSelected: true }
    })
    const button = wrapper.find('button')
    expect(button.classes()).toContain('bg-emerald-50')
    expect(button.classes()).toContain('text-emerald-700')

    const icon = wrapper.find('i')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('ph-check')
  })

  it('emits select event when clicked', async () => {
    const wrapper = mount(ModelOptionCard, {
      props: { label }
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('renders as a list item', () => {
    const wrapper = mount(ModelOptionCard, {
      props: { label }
    })
    expect(wrapper.element.tagName.toLowerCase()).toBe('li')
  })
})

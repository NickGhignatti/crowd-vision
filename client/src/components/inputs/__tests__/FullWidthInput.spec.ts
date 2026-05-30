import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import FullWidthInput from '../FullWidthInput.vue'

describe('FullWidthInput', () => {
  it('renders the current modelValue', () => {
    const wrapper = mount(FullWidthInput, { props: { modelValue: 'Main Campus' } })

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Main Campus')
  })

  it('renders the placeholder when provided', () => {
    const wrapper = mount(FullWidthInput, {
      props: { modelValue: '', placeholder: 'Enter name' },
    })

    expect(wrapper.find('input').attributes('placeholder')).toBe('Enter name')
  })

  it('emits update:modelValue on user input', async () => {
    const wrapper = mount(FullWidthInput, { props: { modelValue: '' } })

    await wrapper.find('input').setValue('New name')

    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['New name'])
  })

  it('has w-full class to stretch to full container width', () => {
    const wrapper = mount(FullWidthInput, { props: { modelValue: '' } })

    expect(wrapper.find('input').classes()).toContain('w-full')
  })
})

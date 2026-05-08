import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusRecord from '../StatusRecord.vue'

describe('StatusRecord.vue', () => {
  it('renders a table row with the correct colspan', () => {
    const wrapper = mount(StatusRecord, {
      props: {
        colspan: 5
      }
    })

    const td = wrapper.find('td')
    expect(td.exists()).toBe(true)
    expect(td.attributes('colspan')).toBe('5')
  })

  it('applies animate-pulse class when pulse prop is true', () => {
    const wrapper = mount(StatusRecord, {
      props: {
        colspan: 3,
        pulse: true
      }
    })

    const td = wrapper.find('td')
    expect(td.classes()).toContain('animate-pulse')
  })

  it('does not apply animate-pulse class when pulse prop is false', () => {
    const wrapper = mount(StatusRecord, {
      props: {
        colspan: 3,
        pulse: false
      }
    })

    const td = wrapper.find('td')
    expect(td.classes()).not.toContain('animate-pulse')
  })

  it('renders default slot content', () => {
    const wrapper = mount(StatusRecord, {
      props: {
        colspan: 3
      },
      slots: {
        default: '<span class="test-content">Loading...</span>'
      }
    })

    expect(wrapper.find('.test-content').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading...')
  })

  it('has base styling classes', () => {
    const wrapper = mount(StatusRecord, {
      props: {
        colspan: 3
      }
    })

    const td = wrapper.find('td')
    expect(td.classes()).toContain('p-8')
    expect(td.classes()).toContain('text-center')
    expect(td.classes()).toContain('text-slate-500')
  })

  it('is a tr element at root', () => {
    const wrapper = mount(StatusRecord, {
      props: {
        colspan: 3
      }
    })

    expect(wrapper.element.tagName).toBe('TR')
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PanelHeader from '../PanelHeader.vue'

describe('PanelHeader.vue', () => {
  it('renders the title prop correctly', () => {
    const title = 'Test Title'
    const wrapper = mount(PanelHeader, {
      props: { title }
    })
    expect(wrapper.find('h2').text()).toBe(title)
  })

  it('emits toggle event when button is clicked', async () => {
    const wrapper = mount(PanelHeader, {
      props: { title: 'Title' }
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('toggle')).toBeTruthy()
  })

  it('renders ph-caret-left when side is left', () => {
    const wrapper = mount(PanelHeader, {
      props: { title: 'Title', side: 'left' }
    })
    expect(wrapper.find('i').classes()).toContain('ph-caret-left')
  })

  it('renders ph-caret-right when side is right', () => {
    const wrapper = mount(PanelHeader, {
      props: { title: 'Title', side: 'right' }
    })
    expect(wrapper.find('i').classes()).toContain('ph-caret-right')
  })

  it('renders ph-caret-right by default when side is not provided', () => {
    const wrapper = mount(PanelHeader, {
      props: { title: 'Title' }
    })
    expect(wrapper.find('i').classes()).toContain('ph-caret-right')
  })

  it('renders title slot content when provided', () => {
    const wrapper = mount(PanelHeader, {
      props: { title: 'Original Title' },
      slots: {
        title: '<div class="custom-title">Custom Title</div>'
      }
    })
    expect(wrapper.find('.custom-title').exists()).toBe(true)
    expect(wrapper.find('.custom-title').text()).toBe('Custom Title')
    expect(wrapper.find('h2').exists()).toBe(false)
  })

  it('renders search slot content when provided', () => {
    const wrapper = mount(PanelHeader, {
      props: { title: 'Title' },
      slots: {
        search: '<input class="search-input" />'
      }
    })
    expect(wrapper.find('.search-input').exists()).toBe(true)
  })
})

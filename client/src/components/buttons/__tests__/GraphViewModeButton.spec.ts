import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import GraphViewModeButton from '../GraphViewModeButton.vue'

describe('GraphViewModeButton', () => {
  describe('props', () => {
    it('applies active styles when viewMode is "graph"', () => {
      const wrapper = mount(GraphViewModeButton, {
        props: { viewMode: 'graph' },
      })

      expect(wrapper.find('button').classes()).toContain('text-slate-800')
      expect(wrapper.find('button').classes()).not.toContain('text-slate-500')
    })

    it('applies inactive styles when viewMode is not "graph"', () => {
      const wrapper = mount(GraphViewModeButton, {
        props: { viewMode: 'table' },
      })

      expect(wrapper.find('button').classes()).toContain('text-slate-500')
      expect(wrapper.find('button').classes()).not.toContain('text-slate-800')
    })
  })

  describe('emits', () => {
    it('emits "click" with "graph" payload when clicked', async () => {
      const wrapper = mount(GraphViewModeButton, {
        props: { viewMode: 'table' },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toBeTruthy()
      expect(wrapper.emitted('click')![0]).toEqual(['graph'])
    })

    it('emits exactly once per click', async () => {
      const wrapper = mount(GraphViewModeButton, {
        props: { viewMode: 'table' },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toHaveLength(1)
    })
  })
})

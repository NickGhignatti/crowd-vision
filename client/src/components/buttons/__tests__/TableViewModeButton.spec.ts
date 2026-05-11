import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import TableViewModeButton from '../TableViewModeButton.vue'

describe('TableViewModeButton', () => {
  describe('props', () => {
    it('applies active styles when viewMode is "table"', () => {
      const wrapper = mount(TableViewModeButton, {
        props: { viewMode: 'table' },
      })

      expect(wrapper.find('button').classes()).toContain('text-slate-800')
      expect(wrapper.find('button').classes()).not.toContain('text-slate-500')
    })

    it('applies inactive styles when viewMode is not "table"', () => {
      const wrapper = mount(TableViewModeButton, {
        props: { viewMode: 'graph' },
      })

      expect(wrapper.find('button').classes()).toContain('text-slate-500')
      expect(wrapper.find('button').classes()).not.toContain('text-slate-800')
    })
  })

  describe('emits', () => {
    it('emits "click" with "table" payload when clicked', async () => {
      const wrapper = mount(TableViewModeButton, {
        props: { viewMode: 'graph' },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toBeTruthy()
      expect(wrapper.emitted('click')![0]).toEqual(['table'])
    })

    it('emits exactly once per click', async () => {
      const wrapper = mount(TableViewModeButton, {
        props: { viewMode: 'graph' },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('click')).toHaveLength(1)
    })
  })
})

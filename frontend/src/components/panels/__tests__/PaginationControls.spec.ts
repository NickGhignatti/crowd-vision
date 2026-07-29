import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import PaginationControls from '../PaginationControls.vue'

const mountComponent = (props: {
  currentPage: number
  totalPages: number
  isAutoPlaying: boolean
}) => {
  return mount(PaginationControls, {
    props,
    global: {
      mocks: {
        t: (key: string) => key,
      },
    },
  })
}

describe('PaginationControls', () => {
  describe('page info', () => {
    it('displays the current page', () => {
      const wrapper = mountComponent({ currentPage: 2, totalPages: 5, isAutoPlaying: false })

      expect(wrapper.find('span.text-emerald-700').text()).toBe('2')
    })

    it('displays totalPages when it is greater than 0', () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 5, isAutoPlaying: false })

      expect(wrapper.text()).toContain('5')
    })

    it('displays 1 as min totalPages when totalPages is 0', () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 0, isAutoPlaying: false })

      expect(wrapper.text()).toContain('1')
    })
  })

  describe('prev button', () => {
    it('is disabled on the first page', () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 5, isAutoPlaying: false })

      const prevButton = wrapper.findAll('button')[1]
      expect(prevButton?.attributes('disabled')).toBeDefined()
    })

    it('is enabled when not on the first page', () => {
      const wrapper = mountComponent({ currentPage: 2, totalPages: 5, isAutoPlaying: false })

      const prevButton = wrapper.findAll('button')[1]
      expect(prevButton?.attributes('disabled')).toBeUndefined()
    })

    it('emits "prev-page" when clicked', async () => {
      const wrapper = mountComponent({ currentPage: 2, totalPages: 5, isAutoPlaying: false })

      const prevButton = wrapper.findAll('button')[1]
      expect(prevButton).toBeDefined()
      await prevButton?.trigger('click')

      expect(wrapper.emitted('prev-page')).toBeTruthy()
    })
  })

  describe('next button', () => {
    it('is disabled on the last page when not autoplaying', () => {
      const wrapper = mountComponent({ currentPage: 5, totalPages: 5, isAutoPlaying: false })

      const nextButton = wrapper.findAll('button')[2]
      expect(nextButton?.attributes('disabled')).toBeDefined()
    })

    it('is enabled on the last page when autoplaying', () => {
      const wrapper = mountComponent({ currentPage: 5, totalPages: 5, isAutoPlaying: true })

      const nextButton = wrapper.findAll('button')[2]
      expect(nextButton?.attributes('disabled')).toBeUndefined()
    })

    it('is enabled when not on the last page', () => {
      const wrapper = mountComponent({ currentPage: 3, totalPages: 5, isAutoPlaying: false })

      const nextButton = wrapper.findAll('button')[2]
      expect(nextButton?.attributes('disabled')).toBeUndefined()
    })

    it('emits "next-page" when clicked', async () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 5, isAutoPlaying: false })

      const nextButton = wrapper.findAll('button')[2]
      expect(nextButton).toBeDefined()
      await nextButton?.trigger('click')

      expect(wrapper.emitted('next-page')).toBeTruthy()
    })
  })

  describe('autoplay button', () => {
    it('applies active styles when autoplaying', () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 5, isAutoPlaying: true })

      const autoPlayButton = wrapper.findAll('button')[0]
      expect(autoPlayButton?.classes()).toContain('bg-emerald-100')
      expect(autoPlayButton?.classes()).not.toContain('bg-white')
    })

    it('applies inactive styles when not autoplaying', () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 5, isAutoPlaying: false })

      const autoPlayButton = wrapper.findAll('button')[0]
      expect(autoPlayButton?.classes()).toContain('bg-white')
      expect(autoPlayButton?.classes()).not.toContain('bg-emerald-100')
    })

    it('shows the pulsing indicator when autoplaying', () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 5, isAutoPlaying: true })

      expect(wrapper.find('span.animate-ping').exists()).toBe(true)
    })

    it('hides the pulsing indicator when not autoplaying', () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 5, isAutoPlaying: false })

      expect(wrapper.find('span.animate-ping').exists()).toBe(false)
    })

    it('emits "toggle-auto-play" when clicked', async () => {
      const wrapper = mountComponent({ currentPage: 1, totalPages: 5, isAutoPlaying: false })

      const autoPlayButton = wrapper.findAll('button')[0]
      expect(autoPlayButton).toBeDefined()
      await autoPlayButton?.trigger('click')

      expect(wrapper.emitted('toggle-auto-play')).toBeTruthy()
    })
  })
})

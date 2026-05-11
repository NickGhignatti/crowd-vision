import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DomainRecord from '@/components/records/DomainRecord.vue'
import type { DomainSubscriptionRowProps } from '@/interfaces/domain.ts'

const defaultProps: DomainSubscriptionRowProps = {
  id: 1,
  name: 'example.com',
  isSubscribed: false,
}

describe('DomainRecord', () => {
  describe('rendering', () => {
    it('displays the domain name provided in props', () => {
      const wrapper = mount(DomainRecord, { props: defaultProps })
      expect(wrapper.text()).toContain('example.com')
    })
  })

  describe('behavior', () => {
    it('emits "subscribe" with the id when clicked and NOT currently subscribed', async () => {
      const wrapper = mount(DomainRecord, {
        props: { ...defaultProps, id: 42, isSubscribed: false },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('subscribe')).toBeTruthy()
      expect(wrapper.emitted('subscribe')?.[0]).toEqual([42])

      // Ensure the opposite event was not accidentally fired
      expect(wrapper.emitted('unsubscribe')).toBeUndefined()
    })

    it('emits "unsubscribe" with the id when clicked and IS currently subscribed', async () => {
      const wrapper = mount(DomainRecord, {
        props: { ...defaultProps, id: 99, isSubscribed: true },
      })

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('unsubscribe')).toBeTruthy()
      expect(wrapper.emitted('unsubscribe')?.[0]).toEqual([99])

      expect(wrapper.emitted('subscribe')).toBeUndefined()
    })
  })
})

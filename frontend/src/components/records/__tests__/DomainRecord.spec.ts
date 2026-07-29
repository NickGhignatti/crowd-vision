import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DomainRecord from '@/components/records/DomainRecord.vue'
import type { DomainSubscriptionRowProps } from '@/interfaces/domain.ts'

const defaultProps: DomainSubscriptionRowProps = {
  id: 1,
  name: 'example.com',
  isSubscribed: false,
  isPrivate: false,
}

describe('DomainRecord', () => {
  describe('rendering', () => {
    it('displays the domain name provided in props', () => {
      const wrapper = mount(DomainRecord, { props: defaultProps })
      expect(wrapper.text()).toContain('example.com')
    })

    it('shows the role badge when a role is provided', () => {
      const wrapper = mount(DomainRecord, {
        props: { ...defaultProps, isSubscribed: true, role: 'business_admin' },
      })
      expect(wrapper.text()).toContain('domains.roles.businessAdmin')
    })

    it('shows the "not a member" label when no role is provided', () => {
      const wrapper = mount(DomainRecord, { props: defaultProps })
      expect(wrapper.text()).toContain('domains.labels.notMember')
    })

    it('renders member and building counts, falling back to a dash', () => {
      const wrapper = mount(DomainRecord, {
        props: { ...defaultProps, memberCount: 7 },
      })
      const text = wrapper.text()
      expect(text).toContain('7')
      expect(text).toContain('—')
    })

    it('shows a private chip and no action button on private rows', () => {
      const wrapper = mount(DomainRecord, {
        props: { ...defaultProps, isPrivate: true, isSubscribed: true, role: 'standard_customer' },
      })
      expect(wrapper.text()).toContain('domains.labels.private')
      expect(wrapper.find('button').exists()).toBe(false)
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

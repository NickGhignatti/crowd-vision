import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DomainRow from '@/components/tables/components/DomainRow.vue'

describe('DomainRow.vue', () => {
  const defaultProps = {
    id: 123,
    name: 'example.com',
    isSubscribed: false,
  }

  it('renders the domain name correctly', () => {
    const wrapper = mount(DomainRow, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('example.com')
  })

  it('shows the Subscribe button (plus icon) when not subscribed', () => {
    const wrapper = mount(DomainRow, {
      props: { ...defaultProps, isSubscribed: false },
    })

    const button = wrapper.find('button')
    const icon = button.find('i')

    expect(button.exists()).toBe(true)
    // Check for the specific icon class used for subscribing
    expect(icon.classes()).toContain('ph-user-plus')
    // Ensure the unsubscribe icon is NOT present
    expect(wrapper.find('.ph-user-minus').exists()).toBe(false)
  })

  it('shows the Unsubscribe button (minus icon) when subscribed', () => {
    const wrapper = mount(DomainRow, {
      props: { ...defaultProps, isSubscribed: true },
    })

    const button = wrapper.find('button')
    const icon = button.find('i')

    expect(button.exists()).toBe(true)
    // Check for the specific icon class used for unsubscribing
    expect(icon.classes()).toContain('ph-user-minus')
    // Check for specific styling class (red/emerald-50)
    expect(button.classes()).toContain('bg-emerald-50')
  })

  it('emits "subscribe" event with the correct ID when clicked', async () => {
    const wrapper = mount(DomainRow, {
      props: { ...defaultProps, id: 42, isSubscribed: false },
    })

    await wrapper.find('button').trigger('click')

    // Verify event emission
    expect(wrapper.emitted('subscribe')).toBeTruthy()
    // Verify the payload is the ID passed in props
    expect(wrapper.emitted('subscribe')?.[0]).toEqual([42])
  })

  it('emits "unsubscribe" event with the correct ID when clicked', async () => {
    const wrapper = mount(DomainRow, {
      props: { ...defaultProps, id: 99, isSubscribed: true },
    })

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('unsubscribe')).toBeTruthy()
    expect(wrapper.emitted('unsubscribe')?.[0]).toEqual([99])
  })
})

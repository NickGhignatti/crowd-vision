import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import NotificationCard from '../NotificationCard.vue'

describe('NotificationItem', () => {
  it('renders a red dot for alert notifications', () => {
    const wrapper = mount(NotificationCard, {
      props: {
        notification: {
          type: 'alert',
          message: 'Test alert',
          timestamp: new Date(),
          id: '',
          read: false,
        },
      },
    })

    expect(wrapper.find('.bg-red-500').exists()).toBe(true)
  })

  it('renders a blue dot for non-alert notifications', () => {
    const wrapper = mount(NotificationCard, {
      props: {
        notification: {
          type: 'info',
          message: 'Test info',
          timestamp: new Date(),
          id: '',
          read: false,
        },
      },
    })

    expect(wrapper.find('.bg-blue-500').exists()).toBe(true)
  })
})

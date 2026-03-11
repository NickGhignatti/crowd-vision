import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationDropdown from '../NotificationDropdown.vue'

vi.mock('@/services/socket', async () => {
  const { reactive } = await import('vue')

  return {
    socketState: reactive({
      connected: true,
      notifications: [
        { id: 1, type: 'alert', message: 'Fire!', timestamp: new Date() },
        { id: 2, type: 'info', message: 'Welcome', timestamp: new Date() },
      ],
    }),
  }
})

describe('NotificationDropdown.vue', () => {
  it('shows live indicator when connected', () => {
    const wrapper = mount(NotificationDropdown, {
      global: { stubs: { NotificationItem: true } },
    })

    expect(wrapper.text()).toContain('🟢 Live')
  })

  it('shows offline indicator when disconnected', async () => {
    const { socketState } = await import('@/services/socket')
    socketState.connected = false

    const wrapper = mount(NotificationDropdown, {
      global: { stubs: { NotificationItem: true } },
    })

    expect(wrapper.text()).toContain('🔴 Offline')
  })

  it('renders a NotificationItem for each notification', () => {
    const wrapper = mount(NotificationDropdown, {
      global: { stubs: { NotificationItem: true } },
    })

    expect(wrapper.findAllComponents({ name: 'NotificationItem' })).toHaveLength(2)
  })

  it('shows empty state when there are no notifications', async () => {
    const { socketState } = await import('@/services/socket')
    socketState.notifications = []

    const wrapper = mount(NotificationDropdown, {
      global: { stubs: { NotificationItem: true } },
    })

    expect(wrapper.text()).toContain('No new notifications')
  })
})

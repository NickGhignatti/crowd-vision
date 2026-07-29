import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationsDropdown from '../NotificationsDropdown.vue'

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

describe('NotificationsDropdown', () => {
  it('shows live indicator when connected', () => {
    const wrapper = mount(NotificationsDropdown, {
      global: { stubs: { NotificationCard: true } },
    })

    expect(wrapper.text()).toContain('🟢 Live')
  })

  it('shows offline indicator when disconnected', async () => {
    const { socketState } = await import('@/services/socket.ts')
    socketState.connected = false

    const wrapper = mount(NotificationsDropdown, {
      global: { stubs: { NotificationCard: true } },
    })

    expect(wrapper.text()).toContain('🔴 Offline')
  })

  it('renders a NotificationCard for each notification', () => {
    const wrapper = mount(NotificationsDropdown, {
      global: { stubs: { NotificationCard: true } },
    })

    expect(wrapper.findAll('notification-card-stub')).toHaveLength(2)
  })

  it('shows empty state when there are no notifications', async () => {
    const { socketState } = await import('@/services/socket.ts')
    socketState.notifications = []

    const wrapper = mount(NotificationsDropdown, {
      global: { stubs: { NotificationCard: true } },
    })

    expect(wrapper.text()).toContain('No new notifications')
  })
})



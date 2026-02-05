import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationDropdown from '@/components/menus/NotificationDropdown.vue'

// Mock the socket service state
vi.mock('@/services/socket', async () => {
  // Import 'reactive' inside the mock so it exists when this runs
  const { reactive } = await import('vue')

  return {
    socketState: reactive({
      connected: true,
      unreadCount: 2,
      notifications: [
        { id: 1, type: 'alert', message: 'Fire!', timestamp: Date.now() },
        { id: 2, type: 'info', message: 'Welcome', timestamp: Date.now() },
      ],
    }),
  }
})

describe('NotificationDropdown.vue', () => {
  it('displays unread count badge', () => {
    const wrapper = mount(NotificationDropdown)
    expect(wrapper.find('.bg-red-600').text()).toBe('2')
  })

  it('resets unread count when opened', async () => {
    const wrapper = mount(NotificationDropdown)

    await wrapper.find('button').trigger('click')

    const { socketState } = await import('@/services/socket')
    expect(socketState.unreadCount).toBe(0)

    expect(wrapper.text()).toContain('Fire!')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationBell from '@/components/buttons/NotificationBell.vue'
import { socketState } from '@/services/socket'

vi.mock('@/services/socket', () => ({
  socketState: {
    unreadCount: 0,
    notifications: [],
    connected: true,
  },
}))

describe('NotificationBell', () => {
  beforeEach(() => {
    socketState.unreadCount = 0
    socketState.notifications = []
    socketState.connected = true
  })

  it('renders the bell button', () => {
    const wrapper = mount(NotificationBell)

    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('does not show unread badge when unreadCount is 0', () => {
    const wrapper = mount(NotificationBell)

    expect(wrapper.find('span').exists()).toBe(false)
  })

  it('shows unread badge with correct count when there are unread notifications', async () => {
    socketState.unreadCount = 3
    const wrapper = mount(NotificationBell)

    const badge = wrapper.find('span')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('3')
  })

  it('opens dropdown and resets unread count when bell is clicked', async () => {
    socketState.unreadCount = 5
    const wrapper = mount(NotificationBell)

    await wrapper.find('button').trigger('click')

    expect(socketState.unreadCount).toBe(0)
    // Dropdown should now be visible
    expect(wrapper.findComponent({ name: 'NotificationDropdown' }).exists()).toBe(true)
  })

  it('closes dropdown when bell is clicked again', async () => {
    const wrapper = mount(NotificationBell)

    await wrapper.find('button').trigger('click') // open
    await wrapper.find('button').trigger('click') // close

    expect(wrapper.findComponent({ name: 'NotificationDropdown' }).exists()).toBe(false)
  })
})

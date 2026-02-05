import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PushNotificationToast from '@/components/PushNotificationToast.vue'

const { subscribeMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
}))

vi.mock('@/composables/usePush', async () => {
  const { ref } = await import('vue')
  return {
    usePush: () => ({
      permission: ref('default'),
      isSupported: ref(true),
      subscribe: subscribeMock,
    }),
  }
})

describe('PushNotificationToast.vue', () => {
  it('renders when supported and permission is default', () => {
    const wrapper = mount(PushNotificationToast)
    expect(wrapper.text()).toContain('modals.notification.title')
  })

  it('calls subscribe on enable', async () => {
    const { usePush } = await import('@/composables/usePush')
    const { subscribe } = usePush()

    const wrapper = mount(PushNotificationToast)
    await wrapper.find('button.bg-emerald-500').trigger('click')

    expect(subscribe).toHaveBeenCalled()
  })
})

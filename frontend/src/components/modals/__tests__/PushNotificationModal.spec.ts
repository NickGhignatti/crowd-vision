import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import PushNotificationModal from '@/components/modals/PushNotificationModal.vue'

const { subscribeMock } = vi.hoisted(() => ({ subscribeMock: vi.fn() }))

const permission = ref('default')
const isSupported = ref(true)

vi.mock('@/composables/notification/useWebPushNotifications', () => ({
  useWebPushNotifications: () => ({ permission, isSupported, subscribe: subscribeMock }),
}))

beforeEach(() => {
  permission.value = 'default'
  isSupported.value = true
})

describe('PushNotificationModal', () => {
  describe('visibility', () => {
    it('shows the toast when supported and permission is default', () => {
      const wrapper = mount(PushNotificationModal, { global: { stubs: { Transition: false } } })
      expect(wrapper.find('[class*="fixed"]').exists()).toBe(true)
    })

    it('hides the toast when permission is granted', () => {
      permission.value = 'granted'
      const wrapper = mount(PushNotificationModal, { global: { stubs: { Transition: false } } })
      expect(wrapper.find('[class*="fixed"]').exists()).toBe(false)
    })

    it('hides the toast when permission is denied', () => {
      permission.value = 'denied'
      const wrapper = mount(PushNotificationModal, { global: { stubs: { Transition: false } } })
      expect(wrapper.find('[class*="fixed"]').exists()).toBe(false)
    })

    it('hides the toast when push is not supported', () => {
      isSupported.value = false
      const wrapper = mount(PushNotificationModal, { global: { stubs: { Transition: false } } })
      expect(wrapper.find('[class*="fixed"]').exists()).toBe(false)
    })
  })

  describe('enable button', () => {
    it('calls subscribe when clicked', async () => {
      const wrapper = mount(PushNotificationModal, { global: { stubs: { Transition: false } } })
      await wrapper.find('button.bg-emerald-500').trigger('click')
      expect(subscribeMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('dismiss button', () => {
    it('sets permission to denied when clicked', async () => {
      const wrapper = mount(PushNotificationModal, { global: { stubs: { Transition: false } } })
      await wrapper.find('button.bg-transparent').trigger('click')
      expect(permission.value).toBe('denied')
    })
  })
})

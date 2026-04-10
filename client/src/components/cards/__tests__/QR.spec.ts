import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import QR from '../QR.vue'
import QRCode from 'qrcode'
import { nextTick } from 'vue'

describe('QR', () => {
  const defaultProps = {
    domain: 'unibo.it',
    qrCodes: {
      admin: 'otpauth://totp/admin...',
      business_admin: 'otpauth://totp/business_admin...',
    },
    isLoading: false,
  }

  const createWrapper = (props = {}) =>
    mount(QR, {
      props: { ...defaultProps, ...props },
      global: {
        stubs: {
          Transition: true,
        },
      },
    })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(
      QRCode as unknown as {
        toDataURL: (text: string, options?: QRCode.QRCodeToDataURLOptions) => Promise<string>
      },
      'toDataURL',
    ).mockResolvedValue('data:image/png;base64,mocked-qr-code')

  })

  const waitForQrImage = async (wrapper: ReturnType<typeof createWrapper>) => {
    await vi.waitFor(() => {
      expect(wrapper.find('img[alt="QR code"]').exists()).toBe(true)
    })
  }

  describe('rendering states', () => {
    it('renders empty state when domain is null', () => {
      const wrapper = createWrapper({ domain: null })

      expect(wrapper.text()).toContain(
        'domains.administration.QRCodeTitledomains.administration.selectDomainToSeeQRCode',
      )
      expect(wrapper.find('.ph-qr-code').exists()).toBe(true)
      expect(wrapper.find('img').exists()).toBe(false)
    })

    it('renders loading spinner when isLoading is true', () => {
      const wrapper = createWrapper({ isLoading: true })

      expect(wrapper.find('.animate-spin').exists()).toBe(true)
    })

    it('renders translated text for title and scan message', async () => {
      const wrapper = createWrapper()
      await flushPromises() // Wait for watch to process QR generation

      expect(wrapper.text()).toContain('domains.administration.QRCodeTitle')
      expect(wrapper.text()).toContain('domains.administration.scanQRCode')
    })
  })

  describe('QR code logic', () => {
    it('generates QR codes for all provided roles on mount', async () => {
      const wrapper = createWrapper()

      await flushPromises()
      await waitForQrImage(wrapper)

      expect(QRCode.toDataURL).toHaveBeenCalledTimes(2)
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        'otpauth://totp/admin...',
        expect.objectContaining({ width: 220 }),
      )

      // Check that the mocked image is correctly bound to the src attribute
      const img = wrapper.find('img[alt="QR code"]')
      expect(img.exists()).toBe(true)
      expect(img.attributes('src')).toBe('data:image/png;base64,mocked-qr-code')
    })

    it('selects the first role automatically when qrCodes change', async () => {
      const wrapper = createWrapper()
      await flushPromises()

      // The first key in defaultProps.qrCodes is 'admin'
      expect(wrapper.find('.rounded-full').text()).toContain('domains.roles.admin')
    })

    it('allows switching between roles', async () => {
      const wrapper = createWrapper()
      await flushPromises()

      const buttons = wrapper.findAll('button')
      expect(buttons).toHaveLength(2)

           expect(buttons[1]).toBeDefined()

      // Click the second button ('business_admin')
      await buttons[1]!.trigger('click')

      // The role badge should update to 'Business admin'
      expect(wrapper.find('.rounded-full').text()).toContain('domains.roles.businessAdmin')
    })
  })

  describe('watchers', () => {
    it('resets state when domain changes', async () => {
      const wrapper = createWrapper()

      await flushPromises()
      await waitForQrImage(wrapper)

      expect(wrapper.find('img[alt="QR code"]').exists()).toBe(true)

      // Change the domain prop
      await wrapper.setProps({ domain: 'another-domain.com' })

      await flushPromises()
      await nextTick()

      // The watcher should reset `selectedRole` to null, removing the QR view
      expect(wrapper.find('img[alt="QR code"]').exists()).toBe(false)
    })
  })
})

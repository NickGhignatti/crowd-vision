import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import JoinWithCodeModal from '@/components/modals/creation/JoinWithCodeModal.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const redeemInviteCode = vi.fn()
vi.mock('@/stores/domain.ts', () => ({
  useDomainsStore: () => ({ redeemInviteCode }),
}))

const stubs = {
  Teleport: { template: '<div class="teleport-stub"><slot /></div>' },
  Transition: false,
}

describe('JoinWithCodeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when isOpen is false', () => {
    const wrapper = mount(JoinWithCodeModal, {
      props: { isOpen: false },
      global: { stubs },
    })

    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('renders a code input when isOpen is true', () => {
    const wrapper = mount(JoinWithCodeModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('disables submit while the code input is empty', () => {
    const wrapper = mount(JoinWithCodeModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.continue'))
    expect(submitBtn?.attributes('disabled')).toBeDefined()
  })

  it('redeems the entered code and emits joined on success', async () => {
    redeemInviteCode.mockResolvedValue(undefined)

    const wrapper = mount(JoinWithCodeModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('input').setValue('abc123')
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.continue'))
    await submitBtn?.trigger('click')
    await flushPromises()

    expect(redeemInviteCode).toHaveBeenCalledWith('abc123')
    expect(wrapper.emitted('joined')).toBeTruthy()
  })

  it('shows an error message and does not emit joined when redemption fails', async () => {
    redeemInviteCode.mockRejectedValue(new Error('invite code is invalid'))

    const wrapper = mount(JoinWithCodeModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('input').setValue('bad-code')
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.continue'))
    await submitBtn?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('domains.inputs.joinCodeInvalid')
    expect(wrapper.emitted('joined')).toBeFalsy()
  })

  it('resets the code and error state when closed', async () => {
    redeemInviteCode.mockRejectedValue(new Error('bad'))

    const wrapper = mount(JoinWithCodeModal, {
      props: { isOpen: true },
      global: { stubs },
    })

    await wrapper.find('input').setValue('bad-code')
    const submitBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.continue'))
    await submitBtn?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('domains.inputs.joinCodeInvalid')

    const closeBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.cancel'))
    await closeBtn?.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })
})

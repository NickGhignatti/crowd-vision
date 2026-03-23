import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AddDomain from '@/components/modals/AddDomain.vue'
import type { DomainToAddWithVisibilityPayload } from '@/interfaces/domain'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const DomainInputStub = {
  props: [
    'mainDomain',
    'masterDomainChoices',
    'selectedMasterDomain',
    'authStrategy',
    'issuerUrl',
    'clientId',
    'clientSecret',
    'isVisibleFromOutside',
  ],
  emits: [
    'update-main-domain',
    'update-selected-master-domain',
    'update-auth-strategy',
    'update-issuer-url',
    'update-client-id',
    'update-client-secret',
    'update-is-visible-from-outside',
    'next',
  ],
  template: '<div class="domain-input-stub"></div>',
}

const stubs = {
  DomainInput: DomainInputStub,
  Teleport: { template: '<div class="teleport-stub"><slot /></div>' },
  Transition: false,
}

describe('AddDomain.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('does not render the modal content when isOpen is false', () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: false },
        global: { stubs },
      })
      expect(wrapper.find('.fixed.inset-0').exists()).toBe(false)
    })

    it('renders the modal content when isOpen is true', () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true },
        global: { stubs },
      })
      expect(wrapper.find('.fixed.inset-0').exists()).toBe(true)
      expect(wrapper.findComponent(DomainInputStub).exists()).toBe(true)
    })

    it('shows a spinner and disables the create button when isSubmitting is true', () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true, isSubmitting: true },
        global: { stubs },
      })

      const buttons = wrapper.findAll('button')
      const createBtn = buttons.find((b) => b.attributes('disabled') === '')

      expect(createBtn).toBeTruthy()
      expect(createBtn?.find('.ph-spinner.animate-spin').exists()).toBe(true)
    })
  })

  describe('initialization and watchers', () => {
    it('auto-selects the first master domain choice if provided', () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true, masterDomainChoices: ['acme.com', 'globex.com'] },
        global: { stubs },
      })

      const domainInput = wrapper.findComponent(DomainInputStub)
      expect(domainInput.props('selectedMasterDomain')).toBe('acme.com')
    })
  })

  describe('validation and step progression', () => {
    it('shows an error if the main domain is invalid', async () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true },
        global: { stubs },
      })

      const domainInput = wrapper.findComponent(DomainInputStub)
      await domainInput.vm.$emit('update-main-domain', 'invalid_domain')
      await domainInput.vm.$emit('next')

      expect(wrapper.text()).toContain('domains.modal.errorInvalidMain')
      expect(wrapper.findComponent(DomainInputStub).exists()).toBe(true)
    })

    it('shows an error if authStrategy is OIDC but required fields are missing', async () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true },
        global: { stubs },
      })

      const domainInput = wrapper.findComponent(DomainInputStub)
      await domainInput.vm.$emit('update-main-domain', 'valid.com')
      await domainInput.vm.$emit('update-auth-strategy', 'oidc')

      await domainInput.vm.$emit('next')

      expect(wrapper.text()).toContain('domains.modal.errorInvalidMain')
    })

    it('progresses to step 2 and clears errors if validation passes', async () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true },
        global: { stubs },
      })

      const domainInput = wrapper.findComponent(DomainInputStub)
      await domainInput.vm.$emit('update-main-domain', 'valid.com')
      await domainInput.vm.$emit('next')

      expect(wrapper.text()).not.toContain('domains.modal.errorInvalidMain')

      expect(wrapper.findComponent(DomainInputStub).exists()).toBe(false)
      expect(wrapper.text()).toContain('commons.back')
    })
  })

  describe('submission payload formatting', () => {
    it('emits "add" with the correct internal strategy payload and closes the modal', async () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true, masterDomainChoices: ['hub.com'] },
        global: { stubs },
      })

      const domainInput = wrapper.findComponent(DomainInputStub)
      await domainInput.vm.$emit('update-main-domain', 'Sub-Domain')
      await domainInput.vm.$emit('update-is-visible-from-outside', true)
      // Master domain is 'hub.com' by default due to watcher

      const createBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.create'))
      await createBtn?.trigger('click')

      // 1. Verify 'add' event payload
      const emittedPayload = wrapper.emitted('add')?.[0]?.[0] as DomainToAddWithVisibilityPayload

      expect(emittedPayload).toEqual({
        name: 'sub-domain.hub.com', // correctly concatenated, lowercased, and trimmed
        subdomains: [],
        authStrategy: 'internal',
        isVisibleFromOutside: true,
        masterDomain: 'hub.com',
      })

      // 2. Verify 'close' was emitted
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('emits "add" with the correct OIDC strategy payload (including ssoConfig)', async () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true }, // No master domain choices
        global: { stubs },
      })

      const domainInput = wrapper.findComponent(DomainInputStub)
      await domainInput.vm.$emit('update-main-domain', 'unibo.it')
      await domainInput.vm.$emit('update-auth-strategy', 'oidc')
      await domainInput.vm.$emit('update-issuer-url', 'https://idp.unibo.it')
      await domainInput.vm.$emit('update-client-id', 'client-123')
      await domainInput.vm.$emit('update-client-secret', 'secret-456')

      const createBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.create'))
      await createBtn?.trigger('click')

      const emittedPayload = wrapper.emitted('add')?.[0]?.[0] as DomainToAddWithVisibilityPayload

      expect(emittedPayload).toEqual({
        name: 'unibo.it',
        subdomains: [],
        authStrategy: 'oidc',
        isVisibleFromOutside: false,
        ssoConfig: {
          issuerUrl: 'https://idp.unibo.it',
          clientId: 'client-123',
          clientSecret: 'secret-456',
        },
      })
    })
  })

  describe('closing and state resetting', () => {
    it('resets all form state when closed via the close button', async () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true },
        global: { stubs },
      })

      const domainInput = wrapper.findComponent(DomainInputStub)

      // Dirty the state
      await domainInput.vm.$emit('update-main-domain', 'dirty.com')
      await domainInput.vm.$emit('update-auth-strategy', 'oidc')
      await domainInput.vm.$emit('next') // Move to step 2

      // Trigger close
      const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('commons.cancel'))
      await cancelBtn?.trigger('click')

      expect(wrapper.emitted('close')).toBeTruthy()

      // The state is reset, so if we re-evaluate the DomainInput stub (since it's back to step 1)
      // the props passed down to it should be back to defaults.
      const resetDomainInput = wrapper.findComponent(DomainInputStub)
      expect(resetDomainInput.props('mainDomain')).toBe('')
      expect(resetDomainInput.props('authStrategy')).toBe('internal')
    })

    it('emits close when the backdrop is clicked', async () => {
      const wrapper = mount(AddDomain, {
        props: { isOpen: true },
        global: { stubs },
      })

      await wrapper.find('.bg-slate-900\\/50').trigger('click')
      expect(wrapper.emitted('close')).toBeTruthy()
    })
  })
})

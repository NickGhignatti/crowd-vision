import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DomainCard from '@/components/cards/DomainCard.vue'
import type { SubdomainItem, UnifiedDomainGroup } from '@/interfaces/domain'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/helpers/roles.ts', () => ({
  getRoleMeta: vi.fn((role: string) => ({ i18nKey: `domains.roles.${role}` })),
}))

const UploadButtonStub = {
  props: ['isUploading'],
  emits: ['click'],
  template: '<button class="upload-button-stub" @click="$emit(\'click\')"></button>',
}

const SubdomainCardStub = {
  props: ['name', 'displayName', 'parentDomainName', 'canUpload', 'isUploading'],
  emits: ['select', 'upload'],
  template: '<div class="subdomain-card-stub"></div>',
}

const stubs = {
  UploadButton: UploadButtonStub,
  SubdomainCard: SubdomainCardStub,
  Transition: true,
}

const makeDomainGroup = (overrides: Partial<UnifiedDomainGroup> = {}): UnifiedDomainGroup =>
  ({
    name: 'acme-corp',
    role: 'admin',
    canUpload: false,
    subdomains: [],
    ...overrides,
  }) as unknown as UnifiedDomainGroup

describe('DomainCard.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the domain name and translated role badge', () => {
      const wrapper = mount(DomainCard, {
        props: { domainGroup: makeDomainGroup({ name: 'globex', role: 'business_staff' }) },
        global: { stubs },
      })

      expect(wrapper.text()).toContain('globex')
      expect(wrapper.text()).toContain('domains.roles.business_staff')
    })

    it('renders the upload button only when canUpload is true', () => {
      const withoutUpload = mount(DomainCard, {
        props: { domainGroup: makeDomainGroup({ canUpload: false }) },
        global: { stubs },
      })
      expect(withoutUpload.findComponent(UploadButtonStub).exists()).toBe(false)

      const withUpload = mount(DomainCard, {
        props: { domainGroup: makeDomainGroup({ canUpload: true }) },
        global: { stubs },
      })
      expect(withUpload.findComponent(UploadButtonStub).exists()).toBe(true)
    })

    it('passes the isUploading prop down to the upload button and subdomain cards', () => {
      const domainGroup = makeDomainGroup({
        canUpload: true,
        subdomains: [{ name: 'sub1', displayName: 'Sub 1' } as SubdomainItem],
      })

      const wrapper = mount(DomainCard, {
        props: { domainGroup, isUploading: true },
        global: { stubs },
      })

      expect(wrapper.findComponent(UploadButtonStub).props('isUploading')).toBe(true)
      expect(wrapper.findComponent(SubdomainCardStub).props('isUploading')).toBe(true)
    })
  })

  describe('interactions and event emitting', () => {
    it('emits "select-domain" when the header is clicked', async () => {
      const wrapper = mount(DomainCard, {
        props: { domainGroup: makeDomainGroup({ name: 'acme' }) },
        global: { stubs },
      })

      // Target the header row specifically by its unique class list
      const header = wrapper.find('.p-5.flex.items-center.justify-between.cursor-pointer')
      await header.trigger('click')

      expect(wrapper.emitted('select-domain')).toBeTruthy()
      expect(wrapper.emitted('select-domain')?.[0]).toEqual(['acme'])
    })

    it('emits "upload" with the domain name when the UploadButton is clicked', async () => {
      const wrapper = mount(DomainCard, {
        props: { domainGroup: makeDomainGroup({ name: 'acme', canUpload: true }) },
        global: { stubs },
      })

      await wrapper.findComponent(UploadButtonStub).vm.$emit('click')

      expect(wrapper.emitted('upload')).toBeTruthy()
      expect(wrapper.emitted('upload')?.[0]).toEqual(['acme'])
    })
  })

  describe('child component event bubbling', () => {
    it('bubbles the "select" event from a SubdomainCard up as "select-domain"', async () => {
      const domainGroup = makeDomainGroup({
        subdomains: [{ name: 'sub1', displayName: 'Sub 1' } as SubdomainItem],
      })
      const wrapper = mount(DomainCard, {
        props: { domainGroup },
        global: { stubs },
      })

      const subdomainCard = wrapper.findComponent(SubdomainCardStub)
      await subdomainCard.vm.$emit('select', 'sub1')

      expect(wrapper.emitted('select-domain')).toBeTruthy()
      expect(wrapper.emitted('select-domain')?.[0]).toEqual(['sub1'])
    })

    it('bubbles the "upload" event from a SubdomainCard directly up', async () => {
      const domainGroup = makeDomainGroup({
        subdomains: [{ name: 'sub1', displayName: 'Sub 1' } as SubdomainItem],
      })
      const wrapper = mount(DomainCard, {
        props: { domainGroup },
        global: { stubs },
      })

      const subdomainCard = wrapper.findComponent(SubdomainCardStub)
      await subdomainCard.vm.$emit('upload', 'sub1')

      expect(wrapper.emitted('upload')).toBeTruthy()
      expect(wrapper.emitted('upload')?.[0]).toEqual(['sub1'])
    })
  })
})

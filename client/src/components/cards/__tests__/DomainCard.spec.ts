import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import DomainCard from '../DomainCard.vue'

describe('DomainCard', () => {
  const createDomainGroup = (overrides = {}) => ({
    name: 'unibo.it',
    role: 'business_admin',
    canUpload: true,
    subdomains: [{ name: 'api.unibo.it', displayName: 'api' }],
    ...overrides,
  })

  it('renders translated role label for supported roles', () => {
    const wrapper = mount(DomainCard, {
      props: {
        domainGroup: createDomainGroup({ role: 'business_admin' }),
      },
    })

    expect(wrapper.text()).toContain('domains.roles.businessAdmin')
  })

  it('emits select-domain when clicking a domain without subdomains', async () => {
    const wrapper = mount(DomainCard, {
      props: {
        domainGroup: createDomainGroup({ subdomains: [] }),
      },
    })

    await wrapper.find('.p-5').trigger('click')

    expect(wrapper.emitted('select-domain')?.[0]).toEqual(['unibo.it'])
  })

  it('does emit select-domain from header click when domain has subdomains', async () => {
    const wrapper = mount(DomainCard, {
      props: {
        domainGroup: createDomainGroup(),
      },
    })

    await wrapper.find('.p-5').trigger('click')

    expect(wrapper.emitted('select-domain')).toBeDefined()
  })

  it('forwards upload event with parent domain name', async () => {
    const wrapper = mount(DomainCard, {
      props: {
        domainGroup: createDomainGroup({ canUpload: true }),
      },
    })

    await wrapper.findComponent({ name: 'UploadButton' }).vm.$emit('click')

    expect(wrapper.emitted('upload')?.[0]).toEqual(['unibo.it'])
  })

  it('forwards subdomain selection from nested cards', async () => {
    const wrapper = mount(DomainCard, {
      props: {
        domainGroup: createDomainGroup(),
      },
    })

    await wrapper.findComponent({ name: 'SubDomainCard' }).vm.$emit('select', 'api.unibo.it')

    expect(wrapper.emitted('select-domain')?.[0]).toEqual(['api.unibo.it'])
  })
})


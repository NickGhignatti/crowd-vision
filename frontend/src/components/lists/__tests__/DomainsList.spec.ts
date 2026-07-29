import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import DomainsList from '../DomainsList.vue'

describe('DomainsList', () => {
  const domains = [
    {
      name: 'unibo.it',
      role: 'business_admin',
      canUpload: true,
      subdomains: [{ name: 'api.unibo.it', displayName: 'api' }],
    },
    {
      name: 'example.com',
      role: 'standard_customer',
      canUpload: false,
      subdomains: [],
    },
  ]

  it('renders section title and one card per provided domain', () => {
    const wrapper = mount(DomainsList, {
      props: { domains, isUploading: false },
    })

    expect(wrapper.text()).toContain('domains.administration.organizationDomains')
    expect(wrapper.findAllComponents({ name: 'DomainCard' })).toHaveLength(2)
  })

  it('forwards add-domain from creation button', async () => {
    const wrapper = mount(DomainsList, {
      props: { domains, isUploading: false },
    })

    await wrapper.findComponent({ name: 'CreateDomainButton' }).vm.$emit('click')

    expect(wrapper.emitted('add-domain')).toHaveLength(1)
  })

  it('forwards select-domain and upload from child cards', async () => {
    const wrapper = mount(DomainsList, {
      props: { domains, isUploading: false },
    })

    await wrapper.findComponent({ name: 'DomainCard' }).vm.$emit('select-domain', 'unibo.it')
    await wrapper.findComponent({ name: 'DomainCard' }).vm.$emit('upload', 'unibo.it')

    expect(wrapper.emitted('select-domain')?.[0]).toEqual(['unibo.it'])
    expect(wrapper.emitted('upload')?.[0]).toEqual(['unibo.it'])
  })
})


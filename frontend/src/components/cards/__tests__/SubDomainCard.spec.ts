import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import SubdomainCard from '../SubdomainCard.vue'
import UploadModelButton from '@/components/buttons/UploadModelButton.vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach } from 'vitest'

describe('SubdomainCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const baseProps = {
    name: 'api.unibo.it',
    displayName: 'api',
    parentDomainName: 'unibo.it',
    canUpload: false,
    isUploading: false,
  }

  it('renders display name and parent domain suffix', () => {
    const wrapper = mount(SubdomainCard, {
      props: baseProps,
    })

    expect(wrapper.text()).toContain('api')
    expect(wrapper.text()).toContain('.unibo.it')
  })

  it('emits select with full subdomain when row is clicked', async () => {
    const wrapper = mount(SubdomainCard, {
      props: baseProps,
    })

    await wrapper.find('div.group').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual(['api.unibo.it'])
  })

  it('renders upload button only when canUpload is true', () => {
    const withoutUpload = mount(SubdomainCard, { props: baseProps })
    const withUpload = mount(SubdomainCard, {
      props: { ...baseProps, canUpload: true },
    })

    expect(withoutUpload.findComponent(UploadModelButton).exists()).toBe(false)
    expect(withUpload.findComponent(UploadModelButton).exists()).toBe(true)
  })

  it('emits upload from nested upload button without selecting row', async () => {
    const wrapper = mount(SubdomainCard, {
      props: { ...baseProps, canUpload: true },
    })

    await wrapper.findComponent(UploadModelButton).trigger('click')

    expect(wrapper.emitted('upload')?.[0]).toEqual(['api.unibo.it'])
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})


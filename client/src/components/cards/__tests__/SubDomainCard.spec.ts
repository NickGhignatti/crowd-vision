import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import SubDomainCard from '../SubDomainCard.vue'

describe('SubDomainCard', () => {
  const baseProps = {
    name: 'api.unibo.it',
    displayName: 'api',
    parentDomainName: 'unibo.it',
    canUpload: false,
    isUploading: false,
  }

  it('renders display name and parent domain suffix', () => {
    const wrapper = mount(SubDomainCard, {
      props: baseProps,
    })

    expect(wrapper.text()).toContain('api')
    expect(wrapper.text()).toContain('.unibo.it')
  })

  it('emits select with full subdomain when row is clicked', async () => {
    const wrapper = mount(SubDomainCard, {
      props: baseProps,
    })

    await wrapper.find('div.group').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual(['api.unibo.it'])
  })

  it('renders upload button only when canUpload is true', () => {
    const withoutUpload = mount(SubDomainCard, { props: baseProps })
    const withUpload = mount(SubDomainCard, {
      props: { ...baseProps, canUpload: true },
    })

    expect(withoutUpload.findComponent({ name: 'UploadButton' }).exists()).toBe(false)
    expect(withUpload.findComponent({ name: 'UploadButton' }).exists()).toBe(true)
  })

  it('emits upload from nested upload button without selecting row', async () => {
    const wrapper = mount(SubDomainCard, {
      props: { ...baseProps, canUpload: true },
    })

    await wrapper.findComponent({ name: 'UploadButton' }).vm.$emit('click')

    expect(wrapper.emitted('upload')?.[0]).toEqual(['api.unibo.it'])
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})


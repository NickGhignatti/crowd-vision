import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import UploadButton from '../UploadButton.vue'

describe('UploadButton', () => {
  it('uses the i18n fallback title when title prop is not provided', () => {
    const wrapper = mount(UploadButton)

    expect(wrapper.find('button').attributes('title')).toBe('model.controls.uploadJson')
  })

  it('uses the provided title when passed', () => {
    const wrapper = mount(UploadButton, {
      props: { title: 'custom.title' },
    })

    expect(wrapper.find('button').attributes('title')).toBe('custom.title')
  })

  it('shows spinner icon and disables button while uploading', () => {
    const wrapper = mount(UploadButton, {
      props: { isUploading: true },
    })

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.ph-spinner').exists()).toBe(true)
    expect(wrapper.find('.ph-upload-simple').exists()).toBe(false)
  })

  it('emits click when pressed', async () => {
    const wrapper = mount(UploadButton)

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})


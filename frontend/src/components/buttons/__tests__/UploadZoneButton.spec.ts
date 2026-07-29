import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import UploadZoneButton from '../UploadZoneButton.vue'

describe('UploadZoneButton', () => {
  it('renders the title text', () => {
    const wrapper = mount(UploadZoneButton, {
      props: { icon: 'ph-upload-simple', title: 'Upload model' },
    })

    expect(wrapper.text()).toContain('Upload model')
  })

  it('renders the icon class', () => {
    const wrapper = mount(UploadZoneButton, {
      props: { icon: 'ph-upload-simple', title: 'Upload' },
    })

    expect(wrapper.find('.ph-upload-simple').exists()).toBe(true)
  })

  it('shows spinner and disables button while uploading', () => {
    const wrapper = mount(UploadZoneButton, {
      props: { icon: 'ph-upload-simple', title: 'Upload', isUploading: true },
    })

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.ph-spinner').exists()).toBe(true)
    expect(wrapper.find('.ph-upload-simple').exists()).toBe(false)
  })

  it('emits file-selected with the chosen file', async () => {
    const wrapper = mount(UploadZoneButton, {
      props: { icon: 'ph-upload-simple', title: 'Upload' },
    })

    const file = new File(['{}'], 'building.json', { type: 'application/json' })
    const input = wrapper.find('input[type="file"]')

    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })

    await input.trigger('change')

    expect(wrapper.emitted('file-selected')).toHaveLength(1)
    expect(wrapper.emitted('file-selected')![0]).toEqual([file])
  })

  it('does not emit file-selected when no file is chosen', async () => {
    const wrapper = mount(UploadZoneButton, {
      props: { icon: 'ph-upload-simple', title: 'Upload' },
    })

    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [], writable: false })

    await input.trigger('change')

    expect(wrapper.emitted('file-selected')).toBeFalsy()
  })
})

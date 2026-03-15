import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import CreateDomain from '../CreateDomain.vue'

describe('CreateDomain', () => {
  it('renders the translated label', () => {
    const wrapper = mount(CreateDomain)

    expect(wrapper.text()).toContain('domains.administration.addNewDomain')
  })

  it('emits click when button is pressed', async () => {
    const wrapper = mount(CreateDomain)

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})


import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import CreateDomainButton from '../CreateDomainButton.vue'

describe('CreateDomainButton', () => {
  it('renders the translated label', () => {
    const wrapper = mount(CreateDomainButton)

    expect(wrapper.text()).toContain('domains.administration.addNewDomain')
  })

  it('emits click when button is pressed', async () => {
    const wrapper = mount(CreateDomainButton)

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})


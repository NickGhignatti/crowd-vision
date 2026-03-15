import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import TokenCard from '../Token.vue'

describe('Token card', () => {
  it('renders the provided token value', () => {
    const wrapper = mount(TokenCard, {
      props: { token: '123456' },
    })

    expect(wrapper.text()).toContain('123456')
  })

  it('renders translated labels used in administration page', () => {
    const wrapper = mount(TokenCard, {
      props: { token: '123456' },
    })

    expect(wrapper.text()).toContain('domains.administration.organizationToken')
    expect(wrapper.text()).toContain('domains.administration.activeToken')
    expect(wrapper.text()).toContain('domains.administration.generateNewToken')
  })

  it('emits generate when action button is clicked', async () => {
    const wrapper = mount(TokenCard, {
      props: { token: '123456' },
    })

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('generate')).toHaveLength(1)
  })
})


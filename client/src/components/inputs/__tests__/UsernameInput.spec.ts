import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UsernameInput from '../UsernameInput.vue'

describe('UsernameInput.vue', () => {
  it('updates the model value when input changes', async () => {
    const wrapper = mount(UsernameInput, {
      props: {
        name: '',
        'onUpdate:name': (e: string | undefined) => wrapper.setProps({ name: e }),
      },
    })

    const input = wrapper.find('input')
    await input.setValue('pass')

    expect(wrapper.props('name')).toBe('pass')

    expect(wrapper.emitted('update:name')?.[0]).toEqual(['pass'])
  })
})

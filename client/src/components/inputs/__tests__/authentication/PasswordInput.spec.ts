import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PasswordInput from '../../authentication/PasswordInput.vue'

describe('PasswordInput', () => {
  it('updates the model value when input changes', async () => {
    const wrapper = mount(PasswordInput, {
      props: {
        password: '',
        'onUpdate:password': (e: string | undefined) => wrapper.setProps({ password: e }),
      },
    })

    const input = wrapper.find('input')
    await input.setValue('pass')

    expect(wrapper.props('password')).toBe('pass')

    expect(wrapper.emitted('update:password')?.[0]).toEqual(['pass'])
  })
})

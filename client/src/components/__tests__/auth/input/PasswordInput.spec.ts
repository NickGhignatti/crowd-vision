import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MailInput from '@/components/auth/inputs/PasswordInput.vue'

describe('PasswordInput.vue', () => {
  it('updates the model value when input changes', async () => {
    const wrapper = mount(MailInput, {
      props: {
        password: '',
        'onUpdate:password': (e: string) => wrapper.setProps({ password: e }),
      },
    })

    const input = wrapper.find('input')
    await input.setValue('pass')

    expect(wrapper.props('password')).toBe('pass')

    expect(wrapper.emitted('update:password')?.[0]).toEqual(['pass'])
  })
})

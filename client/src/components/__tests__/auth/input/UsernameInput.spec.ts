import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MailInput from '@/components/inputs/UsernameInput.vue'

describe('usernameInput.vue', () => {
  it('updates the model value when input changes', async () => {
    const wrapper = mount(MailInput, {
      props: {
        username: '',
        'onUpdate:username': (e: string) => wrapper.setProps({ username: e }),
      },
    })

    const input = wrapper.find('input')
    await input.setValue('pass')

    expect(wrapper.props('username')).toBe('pass')

    expect(wrapper.emitted('update:username')?.[0]).toEqual(['pass'])
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MailInput from '@/components/auth/inputs/MailInput.vue'

describe('MailInput.vue', () => {
  it('updates the model value when input changes', async () => {
    const wrapper = mount(MailInput, {
      props: {
        mail: '',
        'onUpdate:mail': (e: string) => wrapper.setProps({ mail: e }),
      },
    })

    const input = wrapper.find('input')
    await input.setValue('test@school.edu')

    expect(wrapper.props('mail')).toBe('test@school.edu')

    expect(wrapper.emitted('update:mail')?.[0]).toEqual(['test@school.edu'])
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatar from '../UserAvatar.vue'

describe('UserAvatar.vue', () => {
  it('renders the picture when one is given', () => {
    const wrapper = mount(UserAvatar, {
      props: { name: 'Mario Rossi', picture: 'https://lh3.googleusercontent.com/a/abc' },
    })

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://lh3.googleusercontent.com/a/abc')
    expect(img.attributes('alt')).toBe('Mario Rossi')
  })

  it('renders initials from the name when there is no picture', () => {
    const wrapper = mount(UserAvatar, { props: { name: 'Mario Rossi' } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('MR')
  })

  it('renders initials from the email when there is no name', () => {
    const wrapper = mount(UserAvatar, { props: { email: 'mario@unibo.it' } })

    expect(wrapper.text()).toBe('MA')
  })

  it('falls back to initials if the picture fails to load', async () => {
    const wrapper = mount(UserAvatar, {
      props: { name: 'Mario Rossi', picture: 'https://broken.example/avatar.png' },
    })

    await wrapper.find('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('MR')
  })

  it('renders the same color class for the same name on repeated renders', () => {
    const first = mount(UserAvatar, { props: { name: 'Mario Rossi' } })
    const second = mount(UserAvatar, { props: { name: 'Mario Rossi' } })

    expect(first.find('span').classes()).toEqual(second.find('span').classes())
  })
})

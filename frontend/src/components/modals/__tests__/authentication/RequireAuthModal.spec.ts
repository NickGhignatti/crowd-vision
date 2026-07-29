import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RequireAuthModal from '@/components/modals/authentication/RequireAuthModal.vue'

describe('RequireAuthModal', () => {
  it('renders slot content', () => {
    const wrapper = mount(RequireAuthModal, {
      slots: {
        default: 'Sign In Required',
      },
    })

    expect(wrapper.text()).toContain('Sign In Required')
  })

  it('renders the lock icon', () => {
    const wrapper = mount(RequireAuthModal)
    const icon = wrapper.find('i.ph-lock-key')

    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('ph-bold')
  })

  it('has correct styling classes', () => {
    const wrapper = mount(RequireAuthModal)
    const button = wrapper.find('button')

    expect(button.classes()).toContain('text-slate-500')
    expect(button.classes()).toContain('hover:text-emerald-600')
    expect(button.classes()).toContain('gap-1.5')
  })

  it('emits click event', async () => {
    const wrapper = mount(RequireAuthModal)

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toBeTruthy()
  })
})

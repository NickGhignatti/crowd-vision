import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import CollapsiblePanel from '../CollapsiblePanel.vue'

describe('CollapsiblePanel.vue', () => {
  it('renders slot content', () => {
    const wrapper = mount(CollapsiblePanel, {
      slots: {
        default: '<div class="test-content">Panel Content</div>'
      }
    })
    expect(wrapper.find('.test-content').exists()).toBe(true)
    expect(wrapper.text()).toContain('Panel Content')
  })

  it('is open by default', () => {
    const wrapper = mount(CollapsiblePanel)
    const aside = wrapper.find('aside')
    // Default isOpen is true, so it should have w-80
    expect(aside.classes()).toContain('w-80')
    // Button should only exist when isOpen is false
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('applies correct classes when side is left', () => {
    const wrapper = mount(CollapsiblePanel, {
      props: { side: 'left' }
    })
    const aside = wrapper.find('aside')
    expect(aside.classes()).toContain('border-r')
    expect(aside.classes()).not.toContain('border-l')
  })

  it('applies correct classes when side is right', () => {
    const wrapper = mount(CollapsiblePanel, {
      props: { side: 'right' }
    })
    const aside = wrapper.find('aside')
    expect(aside.classes()).toContain('border-l')
    expect(aside.classes()).not.toContain('border-r')
  })

  it('applies correct classes and shows button when closed', async () => {
    const wrapper = mount(CollapsiblePanel, {
      props: {
        modelValue: false
      }
    })

    const aside = wrapper.find('aside')
    expect(aside.classes()).toContain('w-0')
    expect(aside.classes()).toContain('overflow-hidden')
    expect(aside.classes()).toContain('border-none')

    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
  })

  it('shows correct button position and icon based on side when closed', () => {
    // Left side
    const leftWrapper = mount(CollapsiblePanel, {
      props: { side: 'left', modelValue: false }
    })
    const leftButton = leftWrapper.find('button')
    expect(leftButton.classes()).toContain('left-6')
    expect(leftButton.find('i').classes()).toContain('ph-caret-right')

    // Right side
    const rightWrapper = mount(CollapsiblePanel, {
      props: { side: 'right', modelValue: false }
    })
    const rightButton = rightWrapper.find('button')
    expect(rightButton.classes()).toContain('right-6')
    expect(rightButton.find('i').classes()).toContain('ph-caret-left')
  })

  it('opens when the button is clicked (v-model integration)', async () => {
    const TestComponent = defineComponent({
      components: { CollapsiblePanel },
      setup() {
        const isOpen = ref(false)
        return { isOpen }
      },
      template: '<CollapsiblePanel v-model="isOpen">Content</CollapsiblePanel>'
    })

    const wrapper = mount(TestComponent)
    const aside = wrapper.find('aside')
    expect(aside.classes()).toContain('w-0')

    const button = wrapper.find('button')
    await button.trigger('click')

    expect(wrapper.vm.isOpen).toBe(true)
    expect(aside.classes()).toContain('w-80')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})

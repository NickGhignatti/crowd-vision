import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseDropdown from '../BaseDropdown.vue'
import { defineComponent, ref, nextTick } from 'vue'

describe('BaseDropdown.vue', () => {
  it('renders trigger slot and hides content by default', () => {
    const wrapper = mount(BaseDropdown, {
      slots: {
        trigger: '<button id="trigger">Click me</button>',
        default: '<div id="content">Dropdown Content</div>',
      },
    })

    expect(wrapper.find('#trigger').exists()).toBe(true)
    expect(wrapper.find('#content').exists()).toBe(false)
  })

  it('shows content when modelValue is true', async () => {
    const wrapper = mount(BaseDropdown, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<div id="content">Dropdown Content</div>',
      },
    })

    expect(wrapper.find('#content').exists()).toBe(true)
  })

  it('toggles isOpen when trigger calls toggle function', async () => {
    const TestComponent = defineComponent({
      components: { BaseDropdown },
      setup() {
        const isOpen = ref(false)
        return { isOpen }
      },
      template: `
        <BaseDropdown v-model="isOpen">
          <template #trigger="{ toggle }">
            <button id="toggle-btn" @click="toggle">Toggle</button>
          </template>
          <div id="content">Dropdown Content</div>
        </BaseDropdown>
      `,
    })

    const wrapper = mount(TestComponent, {
      global: {
        stubs: {
          Transition: true,
        },
      },
    })
    const button = wrapper.find('#toggle-btn')

    expect(wrapper.find('#content').exists()).toBe(false)

    await button.trigger('click')
    expect(wrapper.vm.isOpen).toBe(true)
    expect(wrapper.find('#content').exists()).toBe(true)

    await button.trigger('click')
    expect(wrapper.vm.isOpen).toBe(false)
    expect(wrapper.find('#content').exists()).toBe(false)
  })

  it('closes when backdrop is clicked', async () => {
    const TestComponent = defineComponent({
      components: { BaseDropdown },
      setup() {
        const isOpen = ref(true)
        return { isOpen }
      },
      template: `
        <BaseDropdown v-model="isOpen">
          <div id="content">Dropdown Content</div>
        </BaseDropdown>
      `,
    })

    const wrapper = mount(TestComponent, {
      global: {
        stubs: {
          Transition: true,
        },
      },
    })
    expect(wrapper.find('#content').exists()).toBe(true)

    const backdrop = wrapper.find('.fixed.inset-0')
    await backdrop.trigger('click')

    expect(wrapper.vm.isOpen).toBe(false)
    expect(wrapper.find('#content').exists()).toBe(false)
  })

  it('passes isOpen state to trigger slot', async () => {
    const wrapper = mount(BaseDropdown, {
      props: {
        modelValue: false,
      },
      slots: {
        trigger: `
          <template #trigger="{ isOpen }">
            <span id="status">{{ isOpen ? 'Open' : 'Closed' }}</span>
          </template>
        `,
      },
    })

    expect(wrapper.find('#status').text()).toBe('Closed')

    await wrapper.setProps({ modelValue: true })
    expect(wrapper.find('#status').text()).toBe('Open')
  })

  it('uses Transition for dropdown content', () => {
    const wrapper = mount(BaseDropdown, {
      props: { modelValue: true },
    })

    const transition = wrapper.findComponent({ name: 'Transition' })
    expect(transition.exists()).toBe(true)
  })

  it('applies relative and min-w classes to the root element', () => {
    const wrapper = mount(BaseDropdown)
    expect(wrapper.classes()).toContain('relative')
    expect(wrapper.classes()).toContain('min-w-[200px]')
  })
})

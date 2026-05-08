import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import AuthenticationStrategySelector from '../AuthenticationStrategySelector.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('AuthenticationStrategySelector.vue', () => {
  it('renders the main strategy label', () => {
    const wrapper = mount(AuthenticationStrategySelector, {
      props: {
        modelValue: 'internal',
        'onUpdate:modelValue': (e: any) => wrapper.setProps({ modelValue: e })
      }
    })
    expect(wrapper.find('label.block').text()).toBe('domains.inputs.strategy')
  })

  it('renders both authentication options with labels and descriptions', () => {
    const wrapper = mount(AuthenticationStrategySelector, {
      props: {
        modelValue: 'internal'
      }
    })

    const options = wrapper.findAll('label.cursor-pointer')
    expect(options).toHaveLength(2)

    // Internal option
    expect(options[0]!.text()).toContain('domains.inputs.standard')
    expect(options[0]!.text()).toContain('domains.inputs.managedBy')

    // OIDC option
    expect(options[1]!.text()).toContain('domains.inputs.external')
    expect(options[1]!.text()).toContain('domains.inputs.externalSSO')
  })

  it('reflects the modelValue by checking the correct radio button', async () => {
    const wrapper = mount(AuthenticationStrategySelector, {
      props: {
        modelValue: 'oidc'
      }
    })

    const radios = wrapper.findAll('input[type="radio"]') as any[]
    expect(radios[0].element.checked).toBe(false)
    expect(radios[1].element.checked).toBe(true)

    await wrapper.setProps({ modelValue: 'internal' })
    expect(radios[0].element.checked).toBe(true)
    expect(radios[1].element.checked).toBe(false)
  })

  it('emits update:modelValue when an option is selected', async () => {
    const wrapper = mount(AuthenticationStrategySelector, {
      props: {
        modelValue: 'internal'
      }
    })

    const radios = wrapper.findAll('input[type="radio"]')

    // Select the second option (oidc)
    await radios[1]!.trigger('change')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['oidc'])
  })

  it('works correctly with v-model in a parent component', async () => {
    const TestComponent = defineComponent({
      components: { AuthenticationStrategySelector },
      template: '<AuthenticationStrategySelector v-model="strategy" />',
      setup() {
        const strategy = ref('internal')
        return { strategy }
      }
    })

    const wrapper = mount(TestComponent)
    const radios = wrapper.findAll('input[type="radio"]')

    // Initially internal is selected
    expect((radios[0]!.element as HTMLInputElement).checked).toBe(true)

    // Click external
    await radios[1]!.trigger('change')

    expect((wrapper.vm as any).strategy).toBe('oidc')
    expect((radios[1]!.element as HTMLInputElement).checked).toBe(true)
    expect((radios[0]!.element as HTMLInputElement).checked).toBe(false)
  })

  it('assigns the same name attribute to both radio buttons', () => {
    const wrapper = mount(AuthenticationStrategySelector, {
      props: { modelValue: 'internal' }
    })

    const radios = wrapper.findAll('input[type="radio"]')
    const name0 = radios[0]!.attributes('name')
    const name1 = radios[1]!.attributes('name')

    expect(name0).toBe('authStrategy')
    expect(name1).toBe('authStrategy')
    expect(name0).toBe(name1)
  })
})

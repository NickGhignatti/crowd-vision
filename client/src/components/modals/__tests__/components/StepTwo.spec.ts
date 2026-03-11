import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import StepTwo from '../../components/StepTwo.vue'

const defaultProps = {
  mainDomain: 'unibo.it',
  authStrategy: 'internal',
  subDomains: [],
  error: null,
}

const createWrapper = (props = {}) =>
  mount(StepTwo, {
    props: { ...defaultProps, ...props },
    global: { mocks: { $t: (key: string) => key } },
  })

describe('StepTwo', () => {
  describe('emits', () => {
    it('emits "edit-main" when edit button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('button').trigger('click')

      expect(wrapper.emitted('edit-main')).toHaveLength(1)
    })

    it('emits "add-subdomain" with valid subdomain when add button is clicked', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input').setValue('cs.unibo.it')
      await wrapper.findAll('button')[1].trigger('click')

      expect(wrapper.emitted('add-subdomain')?.[0]).toEqual(['cs.unibo.it'])
    })

    it('emits "add-subdomain" when Enter is pressed on input', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input').setValue('cs.unibo.it')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('add-subdomain')?.[0]).toEqual(['cs.unibo.it'])
    })

    it('emits "clear-error" after successfully adding a subdomain', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input').setValue('cs.unibo.it')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('clear-error')).toHaveLength(1)
    })

    it('emits "set-error" when subdomain does not match main domain', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input').setValue('cs.other.it')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('set-error')?.[0]).toBeDefined()
    })

    it('emits "set-error" when subdomain is invalid', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input').setValue('not-a-domain')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('set-error')?.[0]).toBeDefined()
    })

    it('emits "set-error" when subdomain is already present', async () => {
      const wrapper = createWrapper({ subDomains: ['cs.unibo.it'] })

      await wrapper.find('input').setValue('cs.unibo.it')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('set-error')?.[0]).toBeDefined()
    })

    it('emits "set-error" when subdomain equals main domain', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input').setValue('unibo.it')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('set-error')?.[0]).toBeDefined()
    })

    it('emits "remove-subdomain" with correct index when remove button is clicked', async () => {
      const wrapper = createWrapper({ subDomains: ['cs.unibo.it', 'api.unibo.it'] })

      const removeButtons = wrapper.findAll('.ph-x').map((i) => i.element.closest('button')!)
      await removeButtons[0].click()

      expect(wrapper.emitted('remove-subdomain')?.[0]).toEqual([0])
    })

    it('does not emit "add-subdomain" when input is empty', async () => {
      const wrapper = createWrapper()

      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('add-subdomain')).toBeUndefined()
    })
  })

  describe('rendering', () => {
    it('shows SSO badge when authStrategy is oidc', () => {
      const wrapper = createWrapper({ authStrategy: 'oidc' })

      expect(wrapper.text()).toContain('SSO')
    })

    it('shows STD badge when authStrategy is internal', () => {
      const wrapper = createWrapper()

      expect(wrapper.text()).toContain('STD')
    })

    it('renders subdomain chips when subDomains is not empty', () => {
      const wrapper = createWrapper({ subDomains: ['cs.unibo.it', 'api.unibo.it'] })

      expect(wrapper.text()).toContain('cs.unibo.it')
      expect(wrapper.text()).toContain('api.unibo.it')
    })

    it('does not render subdomain chips when subDomains is empty', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.bg-slate-100.rounded-full').exists()).toBe(false)
    })
  })
})

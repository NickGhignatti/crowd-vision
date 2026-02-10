import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LeftMenu from '@/components/menus/LeftMenu.vue'
import { ref } from 'vue'

vi.mock('@/composables/useUserPermissions', () => ({
  useUserPermissions: () => ({
    memberships: ref([{ domainName: 'test-domain', role: 'admin' }]),
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('LeftMenu.vue', () => {
  const defaultProps = {
    structureIds: ['Building A', 'Building B'],
    selectedId: 'Building A',
    building: { id: 'Building A', rooms: [], domains: [] },
    activeFloor: null,
  }

  it('renders upload button if user is admin', () => {
    const wrapper = mount(LeftMenu, { props: defaultProps })
    expect(wrapper.find(`button[title="${('model.controls.uploadJson')}"]`).exists()).toBe(true)
  })
})

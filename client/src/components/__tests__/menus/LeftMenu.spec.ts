import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LeftMenu from '@/components/menus/LeftMenu.vue'

// Mock Permissions composable
vi.mock('@/composables/useUserPermissions', () => ({
  useUserPermissions: () => ({ isAllowed: { value: true } }),
}))

describe('LeftMenu.vue', () => {
  it('renders structure list and handles selection', async () => {
    const wrapper = mount(LeftMenu, {
      props: {
        structureIds: ['Building A', 'Building B'],
        selectedId: 'Building A',
        building: { id: 'Building A', rooms: [], domains: [] },
        activeFloor: null,
      },
    })

    expect(wrapper.text()).toContain('Building A')
    expect(wrapper.text()).toContain('Building B')

    // Click second item
    const items = wrapper.findAll('.cursor-pointer') // targeting the building card div
    await items[1].trigger('click')

    expect(wrapper.emitted('change-building')?.[0]).toEqual([1])
  })

  it('uploads json file', async () => {
    const wrapper = mount(LeftMenu, {
      props: { structureIds: [], building: null, activeFloor: null },
    })

    const file = new File(['{"id": "test"}'], 'test.json', { type: 'application/json' })

    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve('{"id": "test"}'),
      writable: true,
    })

    const input = wrapper.find('input[type="file"]')

    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })

    await input.trigger('change')

    // Force a wait for the async handler to finish
    // A simple flushPromises might miss the specific tick of the file read + fetch chain
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/twin/register'),
      expect.anything(),
    )
  })
})

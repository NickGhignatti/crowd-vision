import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ControlPanel from '@/components/menus/ControlPanel.vue'
import ControlButton from '@/components/buttons/ControlButton.vue'

describe('ControlPanel.vue', () => {
  const defaultProps = {
    selectedRoomId: null,
    isExploded: false,
    disabled: false,
  }

  it('renders all 5 control buttons', () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: {
        stubs: { ControlButton: true },
      },
    })

    expect(wrapper.findAllComponents(ControlButton)).toHaveLength(5)
  })

  it('handles "Reset View" button', async () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true } },
    })

    // First button is Reset View
    const btn = wrapper.findAllComponents(ControlButton)[0]
    expect(btn.props('icon')).toBe('ph-cube')

    await btn.trigger('click')
    expect(wrapper.emitted('resetView')).toBeTruthy()
  })

  describe('Focus/Explode Button logic', () => {
    it('is disabled when no room is selected', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, selectedRoomId: null },
        global: { stubs: { ControlButton: true } },
      })

      const btn = wrapper.findAllComponents(ControlButton)[1]
      expect(btn.props('disabled')).toBe(true)
    })

    it('is enabled when a room is selected', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, selectedRoomId: 'Room-123' },
        global: { stubs: { ControlButton: true } },
      })

      const btn = wrapper.findAllComponents(ControlButton)[1]
      expect(btn.props('disabled')).toBe(false)
    })

    it('shows "arrows-out" icon when normal view', async () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, selectedRoomId: 'Room-123', isExploded: false },
        global: { stubs: { ControlButton: true } },
      })

      const btn = wrapper.findAllComponents(ControlButton)[1]
      expect(btn.props('icon')).toBe('ph-arrows-out')
      expect(btn.props('active')).toBe(false)

      await btn.trigger('click')
      expect(wrapper.emitted('toggleExplode')).toBeTruthy()
    })

    it('shows "arrows-in" icon and active state when exploded', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, selectedRoomId: 'Room-123', isExploded: true },
        global: { stubs: { ControlButton: true } },
      })

      const btn = wrapper.findAllComponents(ControlButton)[1]
      expect(btn.props('icon')).toBe('ph-arrows-in')
      expect(btn.props('active')).toBe(true)
    })
  })

  it('propagates zoom events', async () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true } },
    })

    // Zoom In
    await wrapper.findAllComponents(ControlButton)[2].trigger('click')
    expect(wrapper.emitted('zoomIn')).toBeTruthy()

    // Zoom Out
    await wrapper.findAllComponents(ControlButton)[3].trigger('click')
    expect(wrapper.emitted('zoomOut')).toBeTruthy()
  })

  it('handles "Panorama" button', async () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true } },
    })

    // Panorama is last
    const btn = wrapper.findAllComponents(ControlButton)[4]
    expect(btn.props('icon')).toBe('ph-camera')

    await btn.trigger('click')
    expect(wrapper.emitted('togglePanorama')).toBeTruthy()
  })

  it('disables applicable buttons when global disabled prop is true', () => {
    const wrapper = mount(ControlPanel, {
      props: { ...defaultProps, disabled: true },
      global: { stubs: { ControlButton: true } },
    })

    const buttons = wrapper.findAllComponents(ControlButton)

    // Reset View -> Disabled
    expect(buttons[0].props('disabled')).toBe(true)
    // Focus -> Disabled
    expect(buttons[1].props('disabled')).toBe(true)
    // Zoom In -> Disabled
    expect(buttons[2].props('disabled')).toBe(true)
    // Zoom Out -> Disabled
    expect(buttons[3].props('disabled')).toBe(true)

    expect(buttons[4].props('disabled')).toBeFalsy()
  })
})

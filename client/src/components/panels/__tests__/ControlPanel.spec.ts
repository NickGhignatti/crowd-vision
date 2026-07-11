import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ControlPanel from '../ControlPanel.vue'
import ControlButton from '@/components/buttons/ControlButton.vue'
import EditToolbar from '../EditToolbar.vue'
import { Mode, useModes } from '@/composables/scene/useModes.ts'

describe('ControlPanel', () => {
  beforeEach(() => {
    useModes().currentMode.value = Mode.NoSensor
  })

  const defaultProps = {
    selectedRoomId: null,
    isExploded: false,
    disabled: false,
    canEdit: true,
    isEditing: false,
  }

  it('renders all 7 control buttons plus the pencil entry button', () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true, EditToolbar: true } },
    })

    const buttons = wrapper.findAllComponents(ControlButton)
    expect(buttons).toHaveLength(8)
    expect(buttons[7]!.props('icon')).toBe('ph-pencil-simple')
  })

  it('hides the pencil entry button for a caller without editing permission', () => {
    const wrapper = mount(ControlPanel, {
      props: { ...defaultProps, canEdit: false },
      global: { stubs: { ControlButton: true, EditToolbar: true } },
    })

    expect(wrapper.findAllComponents(ControlButton)).toHaveLength(7)
  })

  it('emits "enterEdit" when the pencil button is clicked', async () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true, EditToolbar: true } },
    })

    await wrapper.findAllComponents(ControlButton)[7]!.trigger('click')
    expect(wrapper.emitted('enterEdit')).toBeTruthy()
  })

  describe('while editing', () => {
    it('collapses every button except the cube', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, isEditing: true },
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })

      const buttons = wrapper.findAllComponents(ControlButton)
      expect(buttons).toHaveLength(1)
      expect(buttons[0]!.props('icon')).toBe('ph-cube')
    })

    it('emits "exitEdit" instead of "resetView" when the cube is clicked', async () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, isEditing: true },
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })

      await wrapper.findAllComponents(ControlButton)[0]!.trigger('click')
      expect(wrapper.emitted('exitEdit')).toBeTruthy()
      expect(wrapper.emitted('resetView')).toBeFalsy()
    })

    it('never disables the cube button, even when the disabled prop is set', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, isEditing: true, disabled: true },
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })

      expect(wrapper.findAllComponents(ControlButton)[0]!.props('disabled')).toBe(false)
    })

    it('mounts the edit toolbar only while editing', () => {
      const notEditing = mount(ControlPanel, {
        props: defaultProps,
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })
      expect(notEditing.findComponent(EditToolbar).exists()).toBe(false)

      const editing = mount(ControlPanel, {
        props: { ...defaultProps, isEditing: true },
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })
      expect(editing.findComponent(EditToolbar).exists()).toBe(true)
    })
  })

  describe('forwarding to the nested EditToolbar', () => {
    // EditToolbar isn't stubbed here on purpose — this proves the
    // inheritAttrs:false + v-bind="$attrs" wiring actually delivers
    // ControlPanel's undeclared props/listeners (dirty, @save, ...) to it,
    // not just that ControlPanel renders *a* child.
    const editToolbarProps = {
      dirty: true,
      isSaving: false,
      activeTool: 'move' as const,
      canUndo: false,
      canRedo: false,
      viewMode: '3d' as const,
      hasSelection: false,
      isMergePending: false,
      planTool: 'select' as const,
    }

    it('forwards undeclared props to EditToolbar', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, isEditing: true, ...editToolbarProps },
        global: { stubs: { ControlButton: true } },
      })

      expect(wrapper.find('[data-testid="dirty-dot"]').exists()).toBe(true)
    })

    it('forwards EditToolbar events up through ControlPanel', async () => {
      // v-bind="$attrs" binds the caller's onSave listener directly onto
      // EditToolbar — ControlPanel never re-emits 'save' itself, so the
      // listener has to be observed directly rather than via wrapper.emitted().
      const onSave = vi.fn()
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, isEditing: true, ...editToolbarProps, onSave },
        global: { stubs: { ControlButton: true } },
      })

      await wrapper.find('[data-testid="save-edit"]').trigger('click')
      expect(onSave).toHaveBeenCalledTimes(1)
    })
  })

  it('handles "Reset View" button', async () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true, EditToolbar: true } },
    })

    const btn = wrapper.findAllComponents(ControlButton)[0]!
    expect(btn.props('icon')).toBe('ph-cube')

    await btn.trigger('click')
    expect(wrapper.emitted('resetView')).toBeTruthy()
  })

  describe('Focus/Explode Button logic', () => {
    it('is disabled when no room is selected', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, selectedRoomId: null },
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })

      const btn = wrapper.findAllComponents(ControlButton)[1]!
      expect(btn.props('disabled')).toBe(true)
    })

    it('is enabled when a room is selected', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, selectedRoomId: 'RoomCard-123' },
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })

      const btn = wrapper.findAllComponents(ControlButton)[1]!
      expect(btn.props('disabled')).toBe(false)
    })

    it('shows "arrows-out" icon when normal view', async () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, selectedRoomId: 'RoomCard-123', isExploded: false },
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })

      const btn = wrapper.findAllComponents(ControlButton)[1]!
      expect(btn.props('icon')).toBe('ph-arrows-out')
      expect(btn.props('active')).toBe(false)

      await btn.trigger('click')
      expect(wrapper.emitted('toggleExplode')).toBeTruthy()
    })

    it('shows "arrows-in" icon and active state when exploded', () => {
      const wrapper = mount(ControlPanel, {
        props: { ...defaultProps, selectedRoomId: 'RoomCard-123', isExploded: true },
        global: { stubs: { ControlButton: true, EditToolbar: true } },
      })

      const btn = wrapper.findAllComponents(ControlButton)[1]!
      expect(btn.props('icon')).toBe('ph-arrows-in')
      expect(btn.props('active')).toBe(true)
    })
  })

  it('propagates zoom events', async () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true, EditToolbar: true } },
    })

    await wrapper.findAllComponents(ControlButton)[2]!.trigger('click')
    expect(wrapper.emitted('zoomIn')).toBeTruthy()

    await wrapper.findAllComponents(ControlButton)[3]!.trigger('click')
    expect(wrapper.emitted('zoomOut')).toBeTruthy()
  })

  it('handles "Panorama" button', async () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true, EditToolbar: true } },
    })

    const btn = wrapper.findAllComponents(ControlButton)[4]!
    expect(btn.props('icon')).toBe('ph-camera')

    await btn.trigger('click')
    expect(wrapper.emitted('togglePanorama')).toBeTruthy()
  })

  it('toggles temperature mode when the temperature button is clicked', async () => {
    const wrapper = mount(ControlPanel, {
      props: defaultProps,
      global: { stubs: { ControlButton: true, EditToolbar: true } },
    })

    const btn = wrapper.findAllComponents(ControlButton)[5]!
    expect(btn.props('icon')).toBe('ph-thermometer')
    expect(btn.props('active')).toBe(false)

    await btn.trigger('click')

    expect(useModes().currentMode.value).toBe(Mode.TemperatureSensor)
  })

  it('disables applicable buttons when global disabled prop is true', () => {
    const wrapper = mount(ControlPanel, {
      props: { ...defaultProps, disabled: true },
      global: { stubs: { ControlButton: true, EditToolbar: true } },
    })

    const buttons = wrapper.findAllComponents(ControlButton)

    expect(buttons[0]!.props('disabled')).toBe(true)
    expect(buttons[1]!.props('disabled')).toBe(true)
    expect(buttons[2]!.props('disabled')).toBe(true)
    expect(buttons[3]!.props('disabled')).toBe(true)
    expect(buttons[4]!.props('disabled')).toBeFalsy()
    expect(buttons[5]!.props('disabled')).toBeFalsy()
  })
})

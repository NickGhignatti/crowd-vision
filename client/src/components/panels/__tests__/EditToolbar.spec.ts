import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EditToolbar from '@/components/panels/EditToolbar.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const editingProps = {
  canEdit: true,
  isEditing: true,
  dirty: false,
  isSaving: false,
  activeTool: 'move' as const,
  canUndo: false,
  canRedo: false,
  viewMode: '3d' as const,
  hasSelection: false,
  isMergePending: false,
}

describe('EditToolbar', () => {
  it('renders nothing for a caller without editing permission', () => {
    const wrapper = mount(EditToolbar, {
      props: { ...editingProps, canEdit: false, isEditing: false },
    })

    expect(wrapper.find('[data-testid="edit-toolbar"]').exists()).toBe(false)
  })

  it('shows only an Enter Edit Mode button when not editing', () => {
    const wrapper = mount(EditToolbar, {
      props: { ...editingProps, isEditing: false },
    })

    expect(wrapper.find('[data-testid="enter-edit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="save-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cancel-edit"]').exists()).toBe(false)
  })

  it('emits "enter" when the Enter Edit Mode button is clicked', async () => {
    const wrapper = mount(EditToolbar, {
      props: { ...editingProps, isEditing: false },
    })

    await wrapper.find('[data-testid="enter-edit"]').trigger('click')

    expect(wrapper.emitted('enter')).toHaveLength(1)
  })

  it('shows Save and Cancel while editing', () => {
    const wrapper = mount(EditToolbar, { props: editingProps })

    expect(wrapper.find('[data-testid="enter-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="save-edit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cancel-edit"]').exists()).toBe(true)
  })

  it('shows a dirty indicator only when there are unsaved changes', () => {
    const clean = mount(EditToolbar, { props: editingProps })
    expect(clean.find('[data-testid="dirty-dot"]').exists()).toBe(false)

    const dirty = mount(EditToolbar, { props: { ...editingProps, dirty: true } })
    expect(dirty.find('[data-testid="dirty-dot"]').exists()).toBe(true)
  })

  it('disables Save when there is nothing dirty to save', () => {
    const wrapper = mount(EditToolbar, { props: editingProps })

    expect(wrapper.find('[data-testid="save-edit"]').attributes('disabled')).toBeDefined()
  })

  it('emits "save" and "cancel" when their buttons are clicked', async () => {
    const wrapper = mount(EditToolbar, { props: { ...editingProps, dirty: true } })

    await wrapper.find('[data-testid="save-edit"]').trigger('click')
    await wrapper.find('[data-testid="cancel-edit"]').trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('disables Save and shows a saving state while isSaving is true', () => {
    const wrapper = mount(EditToolbar, { props: { ...editingProps, dirty: true, isSaving: true } })

    const saveButton = wrapper.find('[data-testid="save-edit"]')
    expect(saveButton.attributes('disabled')).toBeDefined()
  })

  describe('tool switch', () => {
    it('marks the active tool button', () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, activeTool: 'resize' } })

      expect(wrapper.find('[data-testid="tool-move"]').attributes('aria-pressed')).toBe('false')
      expect(wrapper.find('[data-testid="tool-resize"]').attributes('aria-pressed')).toBe('true')
    })

    it('emits "set-tool" when a tool button is clicked', async () => {
      const wrapper = mount(EditToolbar, { props: editingProps })

      await wrapper.find('[data-testid="tool-resize"]').trigger('click')

      expect(wrapper.emitted('set-tool')?.[0]).toEqual(['resize'])
    })

    it('does not render the tool switch outside edit mode', () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, isEditing: false } })
      expect(wrapper.find('[data-testid="tool-move"]').exists()).toBe(false)
    })
  })

  describe('view mode toggle', () => {
    it('marks the active view mode button', () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, viewMode: 'plan' } })

      expect(wrapper.find('[data-testid="view-3d"]').attributes('aria-pressed')).toBe('false')
      expect(wrapper.find('[data-testid="view-plan"]').attributes('aria-pressed')).toBe('true')
    })

    it('emits "set-view-mode" when a view button is clicked', async () => {
      const wrapper = mount(EditToolbar, { props: editingProps })

      await wrapper.find('[data-testid="view-plan"]').trigger('click')

      expect(wrapper.emitted('set-view-mode')?.[0]).toEqual(['plan'])
    })

    it('does not render the view toggle outside edit mode', () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, isEditing: false } })
      expect(wrapper.find('[data-testid="view-3d"]').exists()).toBe(false)
    })
  })

  describe('structural editing (add/delete/duplicate/merge)', () => {
    it('the Add button is always enabled while editing', async () => {
      const wrapper = mount(EditToolbar, { props: editingProps })

      const addButton = wrapper.find('[data-testid="add-room"]')
      expect(addButton.attributes('disabled')).toBeUndefined()

      await addButton.trigger('click')
      expect(wrapper.emitted('add-room')).toHaveLength(1)
    })

    it('disables Delete/Duplicate/Merge when nothing is selected', () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, hasSelection: false } })

      expect(wrapper.find('[data-testid="delete-room"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-testid="duplicate-room"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-testid="merge-room"]').attributes('disabled')).toBeDefined()
    })

    it('enables and emits Delete/Duplicate/Merge when a room is selected', async () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, hasSelection: true } })

      await wrapper.find('[data-testid="delete-room"]').trigger('click')
      await wrapper.find('[data-testid="duplicate-room"]').trigger('click')
      await wrapper.find('[data-testid="merge-room"]').trigger('click')

      expect(wrapper.emitted('delete-room')).toHaveLength(1)
      expect(wrapper.emitted('duplicate-room')).toHaveLength(1)
      expect(wrapper.emitted('toggle-merge')).toHaveLength(1)
    })

    it('marks the Merge button pressed while a merge is pending', () => {
      const wrapper = mount(EditToolbar, {
        props: { ...editingProps, hasSelection: true, isMergePending: true },
      })

      expect(wrapper.find('[data-testid="merge-room"]').attributes('aria-pressed')).toBe('true')
    })

    it('does not render structural editing buttons outside edit mode', () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, isEditing: false } })
      expect(wrapper.find('[data-testid="add-room"]').exists()).toBe(false)
    })
  })

  describe('undo/redo', () => {
    it('disables undo/redo when there is nothing to undo/redo', () => {
      const wrapper = mount(EditToolbar, { props: editingProps })

      expect(wrapper.find('[data-testid="undo-edit"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-testid="redo-edit"]').attributes('disabled')).toBeDefined()
    })

    it('enables and emits undo/redo when available', async () => {
      const wrapper = mount(EditToolbar, {
        props: { ...editingProps, canUndo: true, canRedo: true },
      })

      expect(wrapper.find('[data-testid="undo-edit"]').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('[data-testid="redo-edit"]').attributes('disabled')).toBeUndefined()

      await wrapper.find('[data-testid="undo-edit"]').trigger('click')
      await wrapper.find('[data-testid="redo-edit"]').trigger('click')

      expect(wrapper.emitted('undo')).toHaveLength(1)
      expect(wrapper.emitted('redo')).toHaveLength(1)
    })
  })
})

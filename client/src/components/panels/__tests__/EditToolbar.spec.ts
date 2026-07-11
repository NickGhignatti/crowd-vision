import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EditToolbar from '@/components/panels/EditToolbar.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const editingProps = {
  dirty: false,
  isSaving: false,
  activeTool: 'move' as const,
  canUndo: false,
  canRedo: false,
  viewMode: '3d' as const,
  hasSelection: false,
  isMergePending: false,
  planTool: 'select' as const,
}

describe('EditToolbar', () => {
  it('shows Save and Cancel while editing, as a check and an X icon', () => {
    const wrapper = mount(EditToolbar, { props: editingProps })

    const saveIcon = wrapper.find('[data-testid="save-edit"] i')
    const cancelIcon = wrapper.find('[data-testid="cancel-edit"] i')
    expect(saveIcon.classes()).toContain('ph-check')
    expect(cancelIcon.classes()).toContain('ph-x')
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

    it('represents Move and Resize as icons (four arrows / ruler), not text', () => {
      const wrapper = mount(EditToolbar, { props: editingProps })

      expect(wrapper.find('[data-testid="tool-move"] i').classes()).toContain(
        'ph-arrows-out-cardinal',
      )
      expect(wrapper.find('[data-testid="tool-resize"] i').classes()).toContain('ph-ruler')
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
  })

  describe('plan tool switch (cursor vs draw)', () => {
    it('is only shown in plan view', () => {
      const threeD = mount(EditToolbar, { props: { ...editingProps, viewMode: '3d' } })
      expect(threeD.find('[data-testid="plan-tool-select"]').exists()).toBe(false)

      const plan = mount(EditToolbar, { props: { ...editingProps, viewMode: 'plan' } })
      expect(plan.find('[data-testid="plan-tool-select"]').exists()).toBe(true)
      expect(plan.find('[data-testid="plan-tool-add"]').exists()).toBe(true)
    })

    it('marks the active plan tool button', () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, viewMode: 'plan', planTool: 'add' } })

      expect(wrapper.find('[data-testid="plan-tool-select"]').attributes('aria-pressed')).toBe('false')
      expect(wrapper.find('[data-testid="plan-tool-add"]').attributes('aria-pressed')).toBe('true')
    })

    it('emits "set-plan-tool" when a plan tool button is clicked', async () => {
      const wrapper = mount(EditToolbar, { props: { ...editingProps, viewMode: 'plan' } })

      await wrapper.find('[data-testid="plan-tool-add"]').trigger('click')

      expect(wrapper.emitted('set-plan-tool')?.[0]).toEqual(['add'])
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

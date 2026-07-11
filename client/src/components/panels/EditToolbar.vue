<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { EditorTool, PlanTool } from '@/composables/scene/useModelEditor.ts'

export type EditorViewMode = '3d' | 'plan'

interface Props {
  dirty: boolean
  isSaving: boolean
  activeTool: EditorTool
  canUndo: boolean
  canRedo: boolean
  viewMode: EditorViewMode
  hasSelection: boolean
  isMergePending: boolean
  planTool: PlanTool
}

defineProps<Props>()

defineEmits<{
  save: []
  cancel: []
  'set-tool': [tool: EditorTool]
  'set-plan-tool': [tool: PlanTool]
  'set-view-mode': [mode: EditorViewMode]
  undo: []
  redo: []
  'add-room': []
  'delete-room': []
  'duplicate-room': []
  'toggle-merge': []
}>()

const { t } = useI18n()
</script>

<template>
  <div data-testid="edit-toolbar" class="flex items-center gap-1 whitespace-nowrap">
    <div class="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
      <button
        data-testid="tool-move"
        :aria-pressed="activeTool === 'move'"
        :title="t('model.editor.moveTool')"
        class="p-1 rounded-full transition-colors"
        :class="activeTool === 'move' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:text-slate-700'"
        @click="$emit('set-tool', 'move')"
      >
        <i class="ph-bold ph-arrows-out-cardinal text-lg"></i>
      </button>
      <button
        data-testid="tool-resize"
        :aria-pressed="activeTool === 'resize'"
        :title="t('model.editor.resizeTool')"
        class="p-1 rounded-full transition-colors"
        :class="activeTool === 'resize' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:text-slate-700'"
        @click="$emit('set-tool', 'resize')"
      >
        <i class="ph-bold ph-ruler text-lg"></i>
      </button>
    </div>

    <div class="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
      <button
        data-testid="view-3d"
        :aria-pressed="viewMode === '3d'"
        class="px-2 py-1 rounded-full text-xs font-medium transition-colors"
        :class="viewMode === '3d' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:text-slate-700'"
        @click="$emit('set-view-mode', '3d')"
      >
        {{ t('model.editor.view3d') }}
      </button>
      <button
        data-testid="view-plan"
        :aria-pressed="viewMode === 'plan'"
        class="px-2 py-1 rounded-full text-xs font-medium transition-colors"
        :class="viewMode === 'plan' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:text-slate-700'"
        @click="$emit('set-view-mode', 'plan')"
      >
        {{ t('model.editor.viewPlan') }}
      </button>
    </div>

    <div v-if="viewMode === 'plan'" class="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
      <button
        data-testid="plan-tool-select"
        :aria-pressed="planTool === 'select'"
        :title="t('model.editor.selectPlanTool')"
        class="px-2 py-1 rounded-full text-xs font-medium transition-colors"
        :class="planTool === 'select' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:text-slate-700'"
        @click="$emit('set-plan-tool', 'select')"
      >
        <i class="ph-bold ph-cursor text-lg"></i>
      </button>
      <button
        data-testid="plan-tool-add"
        :aria-pressed="planTool === 'add'"
        :title="t('model.editor.addPlanTool')"
        class="px-2 py-1 rounded-full text-xs font-medium transition-colors"
        :class="planTool === 'add' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:text-slate-700'"
        @click="$emit('set-plan-tool', 'add')"
      >
        <i class="ph-bold ph-square text-lg"></i>
      </button>
    </div>

    <div class="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
      <button
        data-testid="add-room"
        :title="t('model.editor.addRoom')"
        class="p-1 text-slate-500 hover:text-slate-700"
        @click="$emit('add-room')"
      >
        <i class="ph-bold ph-plus-square text-lg"></i>
      </button>
      <button
        data-testid="duplicate-room"
        :disabled="!hasSelection"
        :title="t('model.editor.duplicateRoom')"
        class="p-1"
        :class="hasSelection ? 'text-slate-500 hover:text-slate-700' : 'text-slate-300 cursor-not-allowed'"
        @click="$emit('duplicate-room')"
      >
        <i class="ph-bold ph-copy text-lg"></i>
      </button>
      <button
        data-testid="merge-room"
        :disabled="!hasSelection"
        :aria-pressed="isMergePending"
        :title="t('model.editor.mergeRoom')"
        class="p-1"
        :class="
          isMergePending
            ? 'text-emerald-600'
            : hasSelection
              ? 'text-slate-500 hover:text-slate-700'
              : 'text-slate-300 cursor-not-allowed'
        "
        @click="$emit('toggle-merge')"
      >
        <i class="ph-bold ph-selection-plus text-lg"></i>
      </button>
      <button
        data-testid="delete-room"
        :disabled="!hasSelection"
        :title="t('model.editor.deleteRoom')"
        class="p-1"
        :class="hasSelection ? 'text-red-500 hover:text-red-600' : 'text-slate-300 cursor-not-allowed'"
        @click="$emit('delete-room')"
      >
        <i class="ph-bold ph-trash text-lg"></i>
      </button>
    </div>

    <button
      data-testid="undo-edit"
      :disabled="!canUndo"
      :title="t('model.editor.undo')"
      class="p-1"
      :class="canUndo ? 'text-slate-500 hover:text-slate-700' : 'text-slate-300 cursor-not-allowed'"
      @click="$emit('undo')"
    >
      <i class="ph-bold ph-arrow-counter-clockwise text-lg"></i>
    </button>
    <button
      data-testid="redo-edit"
      :disabled="!canRedo"
      :title="t('model.editor.redo')"
      class="p-1 mr-1"
      :class="canRedo ? 'text-slate-500 hover:text-slate-700' : 'text-slate-300 cursor-not-allowed'"
      @click="$emit('redo')"
    >
      <i class="ph-bold ph-arrow-clockwise text-lg"></i>
    </button>

    <span
      v-if="dirty"
      data-testid="dirty-dot"
      class="w-2 h-2 rounded-full bg-amber-500"
      :title="t('model.editor.unsaved')"
    />

    <button
      data-testid="cancel-edit"
      :title="t('commons.cancel')"
      class="p-1 text-slate-500 hover:text-slate-700 transition-colors"
      @click="$emit('cancel')"
    >
      <i class="ph-bold ph-x text-lg"></i>
    </button>

    <button
      data-testid="save-edit"
      :disabled="isSaving || !dirty"
      :title="isSaving ? t('model.editor.saving') : t('commons.save')"
      class="p-1 rounded-full transition-colors"
      :class="
        isSaving || !dirty
          ? 'text-slate-300 cursor-not-allowed'
          : 'text-white bg-emerald-600 hover:bg-emerald-700'
      "
      @click="$emit('save')"
    >
      <i class="ph-bold ph-check text-lg"></i>
    </button>
  </div>
</template>

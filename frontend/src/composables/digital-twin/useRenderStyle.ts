import { computed, ref } from 'vue'
import {
  parseRenderStyle,
  RENDER_STYLE_STORAGE_KEY,
  type RenderStyleId,
} from '@/utils/digital-twin/renderStyle.ts'
import { RENDER_STYLES } from './renderStyles/index.ts'

const readStored = (): string | null => {
  try {
    return localStorage.getItem(RENDER_STYLE_STORAGE_KEY)
  } catch {
    return null
  }
}

const current = ref<RenderStyleId>(parseRenderStyle(readStored()))
const style = computed(() => RENDER_STYLES[current.value])

/** The scene's render style, shared by every room mesh and remembered per browser. */
export function useRenderStyle() {
  const setStyle = (id: RenderStyleId) => {
    current.value = id
    try {
      localStorage.setItem(RENDER_STYLE_STORAGE_KEY, id)
    } catch {
      // Private mode: the choice still holds for this tab.
    }
  }

  return { current, style, setStyle }
}

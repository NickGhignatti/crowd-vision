import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export function useFullscreen(target: Ref<HTMLElement | null>) {
  const isFullscreen = ref(false)

  const sync = () => (isFullscreen.value = document.fullscreenElement === target.value)

  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await target.value?.requestFullscreen()
    } catch (error) {
      console.error('Fullscreen request failed:', error)
    }
  }

  onMounted(() => document.addEventListener('fullscreenchange', sync))
  onUnmounted(() => document.removeEventListener('fullscreenchange', sync))

  return { isFullscreen, toggle }
}

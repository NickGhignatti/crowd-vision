import { ref, onUnmounted } from 'vue'

export function useAutoPlay(onTick: () => void, interval = 2000) {
  const isAutoPlaying = ref(false)
  let autoPlayInterval: number | undefined

  const toggleAutoPlay = () => {
    isAutoPlaying.value = !isAutoPlaying.value

    if (isAutoPlaying.value) {
      autoPlayInterval = window.setInterval(onTick, interval)
    } else {
      clearInterval(autoPlayInterval)
    }
  }

  onUnmounted(() => {
    if (autoPlayInterval) clearInterval(autoPlayInterval)
  })

  return { isAutoPlaying, toggleAutoPlay }
}

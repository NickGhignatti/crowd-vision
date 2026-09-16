import { onMounted, onUnmounted, ref } from 'vue'
import { step } from '@/utils/carousel.ts'

/** Index of the front card, advancing every `interval` ms until paused. */
export function useCarousel(length: number, interval = 4000) {
  const current = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined

  const move = (delta: number) => (current.value = step(current.value, delta, length))

  const pause = () => clearInterval(timer)
  const resume = () => {
    pause()
    timer = setInterval(() => move(1), interval)
  }

  // A manual move restarts the countdown, so the card just chosen stays up a full interval.
  const go = (delta: number) => {
    move(delta)
    resume()
  }

  onMounted(resume)
  onUnmounted(pause)

  return { current, next: () => go(1), previous: () => go(-1), pause, resume }
}

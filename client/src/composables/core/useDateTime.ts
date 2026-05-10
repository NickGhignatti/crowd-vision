import { ref, computed, onMounted, onUnmounted } from 'vue'

export function useDateTime(localeRef: { value: string } | undefined) {
  const now = ref(new Date())

  const formattedTime = computed(() => {
    try {
      return new Intl.DateTimeFormat(localeRef?.value, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now.value)
    } catch (e) {
      return now.value.toLocaleTimeString()
    }
  })

  const formattedDate = computed(() => {
    try {
      return new Intl.DateTimeFormat(localeRef?.value, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(now.value)
    } catch (e) {
      return now.value.toLocaleDateString()
    }
  })

  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    timer = setInterval(() => {
      now.value = new Date()
    }, 1000)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { now, formattedTime, formattedDate }
}


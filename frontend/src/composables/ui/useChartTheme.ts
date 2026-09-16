import { shallowRef, watch } from 'vue'
import { useTheme } from '@/composables/ui/useTheme.ts'

const readVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function buildOptions() {
  const grid = readVar('--cv-outline-variant')
  const text = readVar('--cv-on-surface-variant')
  const axis = { grid: { color: grid }, border: { color: grid }, ticks: { color: text } }
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: { legend: { display: false } },
    elements: { line: { tension: 0.4, borderWidth: 2 }, point: { radius: 0, hitRadius: 10 } },
    scales: { x: axis, y: { ...axis, beginAtZero: true } },
  }
}

/**
 * Chart.js cannot read CSS variables, so theme colours are resolved to literals and re-resolved
 * after the theme class flips.
 */
export function useChartTheme() {
  const { theme } = useTheme()
  const options = shallowRef(buildOptions())
  const version = shallowRef(0)

  watch(
    theme,
    () => {
      options.value = buildOptions()
      version.value++
    },
    { flush: 'post' },
  )

  const color = (name: string) => {
    void version.value
    return readVar(name)
  }

  return { options, color }
}

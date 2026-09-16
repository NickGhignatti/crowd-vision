import { onScopeDispose, watch, type Ref } from 'vue'

/** Calls `dismiss` on a pointer press outside `target`, or on Escape, while `active` holds. */
export function useDismiss(
  target: Ref<HTMLElement | null>,
  active: Ref<boolean>,
  dismiss: () => void,
) {
  const onPointerDown = (event: PointerEvent) => {
    if (!target.value?.contains(event.target as Node)) dismiss()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') dismiss()
  }

  const stop = () => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
  }

  watch(
    active,
    (isActive) => {
      stop()
      if (!isActive) return
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
    },
    { immediate: true },
  )

  onScopeDispose(stop)
}

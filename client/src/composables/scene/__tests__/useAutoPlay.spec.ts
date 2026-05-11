import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAutoPlay } from '../useAutoPlay'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

describe('useAutoPlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const setupAutoPlay = (onTick: () => void, interval?: number) => {
    let result: any
    const wrapper = mount(
      defineComponent({
        setup() {
          result = useAutoPlay(onTick, interval)
          return () => null
        },
      }),
    )
    return { ...result, wrapper }
  }

  it('initializes with isAutoPlaying as false', () => {
    const onTick = vi.fn()
    const { isAutoPlaying } = setupAutoPlay(onTick)
    expect(isAutoPlaying.value).toBe(false)
  })

  it('toggles isAutoPlaying state', () => {
    const onTick = vi.fn()
    const { isAutoPlaying, toggleAutoPlay } = setupAutoPlay(onTick)

    toggleAutoPlay()
    expect(isAutoPlaying.value).toBe(true)

    toggleAutoPlay()
    expect(isAutoPlaying.value).toBe(false)
  })

  it('calls onTick periodically when auto playing', () => {
    const onTick = vi.fn()
    const { toggleAutoPlay } = setupAutoPlay(onTick, 1000)

    toggleAutoPlay()

    vi.advanceTimersByTime(1000)
    expect(onTick).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2000)
    expect(onTick).toHaveBeenCalledTimes(3)
  })

  it('stops calling onTick when toggled off', () => {
    const onTick = vi.fn()
    const { toggleAutoPlay } = setupAutoPlay(onTick, 1000)

    toggleAutoPlay()
    vi.advanceTimersByTime(1000)
    expect(onTick).toHaveBeenCalledTimes(1)

    toggleAutoPlay()
    vi.advanceTimersByTime(1000)
    expect(onTick).toHaveBeenCalledTimes(1) // Should not increase
  })

  it('uses default interval of 2000ms if not provided', () => {
    const onTick = vi.fn()
    const { toggleAutoPlay } = setupAutoPlay(onTick)

    toggleAutoPlay()

    vi.advanceTimersByTime(1999)
    expect(onTick).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onTick).toHaveBeenCalledTimes(1)
  })

  it('cleans up interval on unmount', () => {
    const onTick = vi.fn()
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

    const { toggleAutoPlay, wrapper } = setupAutoPlay(onTick)
    toggleAutoPlay()

    wrapper.unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('does not clear interval on unmount if not playing', () => {
    const onTick = vi.fn()
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

    const { wrapper } = setupAutoPlay(onTick)
    wrapper.unmount()

    expect(clearIntervalSpy).not.toHaveBeenCalled()
  })
})

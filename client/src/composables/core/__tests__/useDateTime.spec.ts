import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useDateTime } from '../useDateTime'

describe('useDateTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Set a fixed system time: Friday, May 10, 2024, 10:00:00 UTC
    const mockDate = new Date('2024-05-10T10:00:00Z')
    vi.setSystemTime(mockDate)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const TestComponent = defineComponent({
    props: {
      initialLocale: {
        type: String,
        default: 'en-US'
      }
    },
    setup(props) {
      const localeRef = ref(props.initialLocale)
      const { now, formattedTime, formattedDate } = useDateTime(localeRef)
      return { now, formattedTime, formattedDate, localeRef }
    },
    template: '<div></div>'
  })

  it('initializes with current time', () => {
    const wrapper = mount(TestComponent)
    const vm = wrapper.vm as any

    expect(vm.now).toBeInstanceOf(Date)
    // We expect the mocked date
    expect(vm.now.getTime()).toBe(new Date('2024-05-10T10:00:00Z').getTime())
  })

  it('formats time correctly (24h format as per options)', () => {
    const wrapper = mount(TestComponent, {
      props: { initialLocale: 'en-US' }
    })
    const vm = wrapper.vm as any

    // The composable uses hour12: false
    // Depending on the local timezone where tests run, the hour might differ,
    // but the format should be HH:mm:ss
    expect(vm.formattedTime).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('formats date correctly', () => {
    const wrapper = mount(TestComponent, {
      props: { initialLocale: 'en-US' }
    })
    const vm = wrapper.vm as any

    // Expected: Friday, May 10, 2024 (or similar depending on system locale/timezone)
    // But it should definitely contain these components
    expect(vm.formattedDate).toContain('2024')
    expect(vm.formattedDate).toMatch(/May|5/)
    expect(vm.formattedDate).toContain('10')
  })

  it('updates time every second', async () => {
    const wrapper = mount(TestComponent)
    const vm = wrapper.vm as any

    const initialTime = vm.now.getTime()

    vi.advanceTimersByTime(1000)
    await nextTick()

    expect(vm.now.getTime()).toBe(initialTime + 1000)

    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(vm.now.getTime()).toBe(initialTime + 3000)
  })

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const wrapper = mount(TestComponent)

    wrapper.unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('reacts to locale changes', async () => {
    const wrapper = mount(TestComponent, {
      props: { initialLocale: 'en-US' }
    })
    const vm = wrapper.vm as any

    const usDate = vm.formattedDate

    vm.localeRef = 'fr-FR'
    await nextTick()

    const frDate = vm.formattedDate
    expect(frDate).not.toBe(usDate)
    // In French, May is "mai"
    expect(frDate.toLowerCase()).toContain('mai')
  })

  it('handles undefined localeRef gracefully', () => {
    const NullLocaleComponent = defineComponent({
      setup() {
        const { formattedTime, formattedDate } = useDateTime(undefined)
        return { formattedTime, formattedDate }
      },
      template: '<div></div>'
    })
    const wrapper = mount(NullLocaleComponent)
    const vm = wrapper.vm as any

    expect(vm.formattedTime).toBeDefined()
    expect(vm.formattedDate).toBeDefined()
    expect(vm.formattedTime).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('falls back to locale strings on Intl error', () => {
    // We can trigger an error by providing an invalid locale
    const wrapper = mount(TestComponent, {
      props: { initialLocale: 'invalid-locale' }
    })
    const vm = wrapper.vm as any

    // It should still return a string (fallback to toLocaleTimeString/DateString)
    expect(typeof vm.formattedTime).toBe('string')
    expect(typeof vm.formattedDate).toBe('string')
  })
})

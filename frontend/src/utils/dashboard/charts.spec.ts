import { describe, expect, it } from 'vitest'
import { alignToTimeline, timelineFor } from './charts.ts'

const now = new Date(2026, 8, 16, 10, 44, 43)

describe('the time axis of a history chart', () => {
  it('has one point per hour for a day, ending on the current hour', () => {
    const timeline = timelineFor('1D', now)
    expect(timeline).toHaveLength(24)
    expect(timeline.at(-1)).toEqual(new Date(2026, 8, 16, 10))
    expect(timeline[0]).toEqual(new Date(2026, 8, 15, 11))
  })

  it('has one point per day for a week, ending today at midnight', () => {
    const timeline = timelineFor('1W', now)
    expect(timeline).toHaveLength(7)
    expect(timeline.at(-1)).toEqual(new Date(2026, 8, 16))
  })

  it('has thirty points for a month', () => {
    expect(timelineFor('1M', now)).toHaveLength(30)
  })
})

describe('placing history points on the axis', () => {
  it('matches points by timestamp and fills gaps with zero', () => {
    const timeline = [new Date(2026, 8, 16, 9), new Date(2026, 8, 16, 10)]
    const points = [{ timestamp: timeline[1]!.getTime(), roomId: 'r1', value: 4 }]
    expect(alignToTimeline(points, timeline)).toEqual([0, 4])
  })
})

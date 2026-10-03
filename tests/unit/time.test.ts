import { afterEach, describe, expect, it } from 'vitest'
import { HOUR, MINUTE } from '@shared/constants'
import {
  daySegments,
  floorMinute,
  monthWeeks,
  nextDayStart,
  periodRange,
  timeAtWallMinutes,
  totalMs,
  wallMinutes,
  weekDays
} from '@shared/time'
import { at, entry } from './helpers'

describe('floorMinute', () => {
  it('drops seconds and milliseconds', () => {
    expect(floorMinute(at('2026-10-05T14:05:37.250'))).toBe(at('2026-10-05T14:05'))
    expect(floorMinute(at('2026-10-05T14:05'))).toBe(at('2026-10-05T14:05'))
  })
})

describe('calendar ranges', () => {
  it('weeks start on Monday', () => {
    const days = weekDays(at('2026-10-03T12:00')) // Saturday
    expect(days[0]).toBe(at('2026-09-28T00:00'))
    expect(days[6]).toBe(at('2026-10-04T00:00'))
  })

  it('October 2026 spans 5 weeks with blanks outside the month', () => {
    const weeks = monthWeeks(at('2026-10-15T09:00'))
    expect(weeks).toHaveLength(5)
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null])
    expect(weeks[0][3]).toBe(at('2026-10-01T00:00')) // Thursday
    expect(weeks[4][5]).toBe(at('2026-10-31T00:00'))
    expect(weeks[4][6]).toBeNull()
  })

  it('handles 4- and 6-week months', () => {
    expect(monthWeeks(at('2027-02-10T00:00'))).toHaveLength(4)
    expect(monthWeeks(at('2026-08-10T00:00'))).toHaveLength(6)
  })

  it('period ranges', () => {
    expect(periodRange('week', at('2026-10-01T10:00'))).toEqual({
      from: at('2026-09-28T00:00'),
      to: at('2026-10-05T00:00')
    })
    expect(periodRange('month', at('2026-10-17T10:00'))).toEqual({
      from: at('2026-10-01T00:00'),
      to: at('2026-11-01T00:00')
    })
  })
})

describe('daySegments', () => {
  const mon = at('2026-10-05T00:00')
  const tue = at('2026-10-06T00:00')
  const now = at('2026-10-07T12:00')

  it('splits an entry at midnight', () => {
    const e = entry('a', '2026-10-05T22:30', '2026-10-06T01:15')
    expect(daySegments([e], mon, now)).toEqual([
      { entry: e, start: e.start, end: tue, isFirst: true, isLast: false, running: false }
    ])
    expect(daySegments([e], tue, now)).toEqual([
      { entry: e, start: tue, end: e.end, isFirst: false, isLast: true, running: false }
    ])
  })

  it('an entry ending exactly at midnight belongs to the earlier day only', () => {
    const e = entry('b', '2026-10-05T23:00', '2026-10-06T00:00')
    expect(daySegments([e], mon, now)[0].isLast).toBe(true)
    expect(daySegments([e], tue, now)).toEqual([])
  })

  it('shows a running entry that just started', () => {
    const e = entry('r', '2026-10-05T14:05', null)
    const segs = daySegments([e], mon, at('2026-10-05T14:05:30'))
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ start: e.start, end: e.start, running: true, isLast: true })
  })

  it('a running entry grows to the current minute across midnight', () => {
    const e = entry('r', '2026-10-05T23:00', null)
    const t = at('2026-10-06T01:30:59')
    expect(daySegments([e], mon, t)[0]).toMatchObject({ end: tue, isLast: false })
    expect(daySegments([e], tue, t)[0]).toMatchObject({
      start: tue,
      end: at('2026-10-06T01:30'),
      isFirst: false,
      isLast: true
    })
  })
})

describe('totalMs', () => {
  it('day totals add up to the week total', () => {
    const entries = [
      entry('a', '2026-10-05T09:00', '2026-10-05T10:30'),
      entry('b', '2026-10-05T22:30', '2026-10-06T01:15'),
      entry('c', '2026-10-06T14:00', null)
    ]
    const now = at('2026-10-06T15:20:45')
    const days = weekDays(now)
    const perDay = days.map((d) => totalMs(entries, d, nextDayStart(d), now))
    expect(perDay[0]).toBe(90 * MINUTE + 90 * MINUTE)
    expect(perDay[1]).toBe(75 * MINUTE + 80 * MINUTE)
    expect(perDay.reduce((a, b) => a + b)).toBe(
      totalMs(entries, days[0], nextDayStart(days[6]), now)
    )
  })
})

describe('DST (Europe/Berlin)', () => {
  it('spring-forward day has 23 hours; wall-clock mapping skips the gap', () => {
    const day = at('2026-03-29T00:00')
    expect(nextDayStart(day) - day).toBe(23 * HOUR)
    expect(wallMinutes(at('2026-03-29T03:30'), day)).toBe(210)
    expect(timeAtWallMinutes(day, 150)).toBe(at('2026-03-29T03:30')) // 02:30 doesn't exist
    expect(timeAtWallMinutes(day, 1440)).toBe(nextDayStart(day))
  })

  it('fall-back day has 25 hours; durations stay exact', () => {
    const day = at('2026-10-25T00:00')
    expect(nextDayStart(day) - day).toBe(25 * HOUR)
    const e = entry('a', '2026-10-25T01:00', '2026-10-25T04:00')
    expect(totalMs([e], day, nextDayStart(day), at('2026-10-26T00:00'))).toBe(4 * HOUR)
  })
})

describe('DST (America/New_York)', () => {
  const original = process.env.TZ
  afterEach(() => {
    process.env.TZ = original
  })

  it('fall-back day has 25 hours', () => {
    process.env.TZ = 'America/New_York'
    const day = new Date(2026, 10, 1).getTime() // Nov 1, 2026
    expect(nextDayStart(day) - day).toBe(25 * HOUR)
    expect(weekDays(day)[0]).toBe(new Date(2026, 9, 26).getTime())
  })
})

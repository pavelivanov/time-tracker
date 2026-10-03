import { describe, expect, it } from 'vitest'
import { MINUTE } from '@shared/constants'
import { formatDuration, formatHHMM, formatHourLabel, setHourCycle } from '@shared/format'

describe('formatHourLabel', () => {
  it('follows the system hour cycle', () => {
    setHourCycle('h23')
    expect([formatHourLabel(0), formatHourLabel(13)]).toEqual(['00:00', '13:00'])
    setHourCycle('h12')
    expect(formatHourLabel(13)).toBe('1:00 PM')
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h'],
    [233, '3h 53m'],
    [7853, '130h 53m']
  ])('%i min → %s', (minutes, expected) => {
    expect(formatDuration(minutes * MINUTE)).toBe(expected)
  })

  it('floors partial minutes and never goes negative', () => {
    expect(formatDuration(59_999)).toBe('0m')
    expect(formatDuration(-5 * MINUTE)).toBe('0m')
  })
})

describe('formatHHMM', () => {
  it.each([
    [0, '00:00'],
    [45, '00:45'],
    [233, '03:53'],
    [6005, '100:05'],
    [7853, '130:53']
  ])('%i min → %s', (minutes, expected) => {
    expect(formatHHMM(minutes * MINUTE)).toBe(expected)
  })

  it('clamps negatives to 00:00', () => {
    expect(formatHHMM(-MINUTE)).toBe('00:00')
  })
})

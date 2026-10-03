import { describe, expect, it } from 'vitest'
import { clampResize, resizeBounds, snapStepMinutes, snapTime } from '@shared/resize'
import { at, entry } from './helpers'

describe('snapping', () => {
  it('step depends on zoom; ⌥ forces 1 min', () => {
    expect([24, 32, 48, 64, 96, 144].map((h) => snapStepMinutes(h, false))).toEqual([
      15, 15, 15, 5, 5, 1
    ])
    expect(snapStepMinutes(48, true)).toBe(1)
  })

  it('keeps the original value within half a step, otherwise snaps to the grid', () => {
    const original = at('2026-10-05T15:20')
    expect(snapTime(at('2026-10-05T15:24'), original, 15)).toBe(original)
    expect(snapTime(at('2026-10-05T15:14'), original, 15)).toBe(original)
    expect(snapTime(at('2026-10-05T15:28'), original, 15)).toBe(at('2026-10-05T15:30'))
    expect(snapTime(at('2026-10-05T15:12'), original, 15)).toBe(at('2026-10-05T15:15'))
    expect(snapTime(at('2026-10-05T16:20'), original, 15)).toBe(at('2026-10-05T16:15'))
  })
})

describe('clampResize', () => {
  const now = at('2026-10-05T18:00:30')
  const e = entry('e', '2026-10-05T14:05', '2026-10-05T15:20')

  it('AC-R1: bottom edge follows the snapped pointer', () => {
    const time = snapTime(at('2026-10-05T16:20'), e.end!, 15)
    expect(clampResize({ entry: e, edge: 'end', now }, time).end).toBe(at('2026-10-05T16:15'))
  })

  it('AC-R2: stops flush at the next entry', () => {
    const next = entry('n', '2026-10-05T15:40', '2026-10-05T16:30')
    const r = clampResize({ entry: e, edge: 'end', next, now }, at('2026-10-05T17:00'))
    expect(r.end).toBe(next.start)
  })

  it('AC-R3: end never passes the current minute', () => {
    const r = clampResize({ entry: e, edge: 'end', now }, at('2026-10-05T20:00'))
    expect(r.end).toBe(at('2026-10-05T18:00'))
  })

  it('AC-R4: duration never drops below one minute', () => {
    expect(clampResize({ entry: e, edge: 'end', now }, at('2026-10-05T10:00')).end).toBe(
      at('2026-10-05T14:06')
    )
    expect(clampResize({ entry: e, edge: 'start', now }, at('2026-10-05T17:00')).start).toBe(
      at('2026-10-05T15:19')
    )
  })

  it('top edge stops at the previous entry and the column start', () => {
    const prev = entry('p', '2026-10-05T09:00', '2026-10-05T13:00')
    expect(clampResize({ entry: e, edge: 'start', prev, now }, at('2026-10-05T12:00')).start).toBe(
      prev.end
    )
    expect(clampResize({ entry: e, edge: 'start', now }, at('2026-10-04T23:00')).start).toBe(
      at('2026-10-05T00:00')
    )
  })

  it('AC-R7: a running entry can only move its start, up to the current minute', () => {
    const running = entry('r', '2026-10-05T17:00', null)
    expect(clampResize({ entry: running, edge: 'start', now }, at('2026-10-05T19:00')).start).toBe(
      at('2026-10-05T18:00')
    )
    expect(() => resizeBounds({ entry: running, edge: 'end', now })).toThrow()
  })

  it('cross-midnight edges stay inside their own columns', () => {
    const night = entry('x', '2026-10-05T22:30', '2026-10-06T01:15')
    const later = at('2026-10-07T12:00')
    expect(resizeBounds({ entry: night, edge: 'start', now: later })).toEqual({
      min: at('2026-10-05T00:00'),
      max: at('2026-10-05T23:59')
    })
    expect(resizeBounds({ entry: night, edge: 'end', now: later })).toEqual({
      min: at('2026-10-06T00:01'),
      max: at('2026-10-07T00:00')
    })
  })

  it('never forces a change when the clock moved backwards', () => {
    const running = entry('r', '2026-10-05T17:00', null)
    const r = clampResize(
      { entry: running, edge: 'start', now: at('2026-10-05T16:00') },
      running.start
    )
    expect(r.start).toBe(running.start)
  })

  it('rounds unaligned input to whole minutes', () => {
    const r = clampResize({ entry: e, edge: 'end', now }, at('2026-10-05T16:00:40'))
    expect(r.end).toBe(at('2026-10-05T16:01'))
  })
})

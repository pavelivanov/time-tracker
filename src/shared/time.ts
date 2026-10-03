import { addDays, addMonths, addWeeks, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { MINUTE, WEEK_STARTS_ON } from './constants'
import type { Entry, View } from './types'

/** Start of the minute containing `t`. Every stored timestamp passes through this (SPEC §6.1). */
export const floorMinute = (t: number): number => t - (((t % MINUTE) + MINUTE) % MINUTE)

export const dayStartOf = (t: number): number => startOfDay(t).getTime()
export const nextDayStart = (dayStart: number): number => addDays(dayStart, 1).getTime()
export const weekStartOf = (t: number): number =>
  startOfWeek(t, { weekStartsOn: WEEK_STARTS_ON }).getTime()

/** Local midnights of the 7 days (Mon→Sun) of the week containing `t`. */
export function weekDays(t: number): number[] {
  const start = weekStartOf(t)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i).getTime())
}

/** Month as whole Monday-first weeks; days outside the month are `null` (SPEC §10.1). */
export function monthWeeks(t: number): (number | null)[][] {
  const first = startOfMonth(t)
  const month = first.getMonth()
  const weeks: (number | null)[][] = []
  let cursor = startOfWeek(first, { weekStartsOn: WEEK_STARTS_ON })
  do {
    const week: (number | null)[] = []
    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i)
      week.push(day.getMonth() === month ? day.getTime() : null)
    }
    weeks.push(week)
    cursor = addWeeks(cursor, 1)
  } while (cursor.getMonth() === month)
  return weeks
}

/** `[from, to)` of the week or month containing `anchor`. */
export function periodRange(view: View, anchor: number): { from: number; to: number } {
  if (view === 'week') {
    const from = weekStartOf(anchor)
    return { from, to: addDays(from, 7).getTime() }
  }
  const from = startOfMonth(anchor).getTime()
  return { from, to: addMonths(from, 1).getTime() }
}

export function shiftPeriod(view: View, anchor: number, dir: -1 | 1): number {
  return (view === 'week' ? addWeeks(anchor, dir) : addMonths(anchor, dir)).getTime()
}

/** Exclusive end; a running entry ends at the current minute. */
export const entryEnd = (e: Entry, now: number): number =>
  e.end ?? Math.max(e.start, floorMinute(now))

export const entryDuration = (e: Entry, now: number): number => entryEnd(e, now) - e.start

export function overlapMs(e: Entry, from: number, to: number, now: number): number {
  return Math.max(0, Math.min(entryEnd(e, now), to) - Math.max(e.start, from))
}

/** Tracked time inside `[from, to)` (SPEC §11). */
export function totalMs(entries: readonly Entry[], from: number, to: number, now: number): number {
  let sum = 0
  for (const e of entries) sum += overlapMs(e, from, to, now)
  return sum
}

/** Part of an entry inside one local day. */
export interface Segment {
  entry: Entry
  start: number
  end: number
  /** Segment holds the entry's real start (top edge is resizable). */
  isFirst: boolean
  /** Segment holds the entry's real end (bottom edge, or the running edge). */
  isLast: boolean
  running: boolean
}

export function daySegments(entries: readonly Entry[], dayStart: number, now: number): Segment[] {
  const dayEnd = nextDayStart(dayStart)
  const segments: Segment[] = []
  for (const entry of entries) {
    const end = entryEnd(entry, now)
    const start = Math.max(entry.start, dayStart)
    const clippedEnd = Math.min(end, dayEnd)
    const justStarted = entry.end === null && entry.start === end
    const visible =
      start < clippedEnd || (justStarted && entry.start >= dayStart && entry.start < dayEnd)
    if (!visible) continue
    segments.push({
      entry,
      start,
      end: Math.max(start, clippedEnd),
      isFirst: entry.start >= dayStart,
      isLast: end <= dayEnd,
      running: entry.end === null
    })
  }
  return segments
}

/** Wall-clock minutes since the local midnight `dayStart`; the next midnight maps to 1440. */
export function wallMinutes(t: number, dayStart: number): number {
  if (t >= nextDayStart(dayStart)) return 1440
  if (t <= dayStart) return 0
  const d = new Date(t)
  return d.getHours() * 60 + d.getMinutes()
}

/** Inverse of `wallMinutes`, built with the wall-clock constructor so DST days map correctly. */
export function timeAtWallMinutes(dayStart: number, minutes: number): number {
  const d = new Date(dayStart)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime()
}
